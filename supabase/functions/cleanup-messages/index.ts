import { ensurePost, json } from "../_shared/http.ts";
import { CONTEXT_TTL_MS } from "../_shared/constants.ts";
import { db } from "../_shared/supabase.ts";
import { deleteTelegramMessage } from "../_shared/telegram.ts";

const MAX_DELETE_ATTEMPTS = 10;
const RETRY_DELAY_MS = 60_000;
const BATCH_SIZE = 200;

type CleanupRow = {
  id: number;
  chat_id: number;
  message_id: number;
  attempts: number | null;
};

type FailedItem = {
  chatId: number;
  messageId: number;
  error: string;
};

function nextAttempt(attempts: number | null): number {
  return Number(attempts ?? 0) + 1;
}

function getContextCutoffIso(): string {
  return new Date(Date.now() - CONTEXT_TTL_MS).toISOString();
}

function getRetryDueAtIso(): string {
  return new Date(Date.now() + RETRY_DELAY_MS).toISOString();
}

function getRetryDueAtIsoWithMs(delayMs: number): string {
  return new Date(Date.now() + Math.max(delayMs, 1_000)).toISOString();
}

function extractRetryAfterMs(errorText: string): number | null {
  const match = errorText.match(/"retry_after"\s*:\s*(\d+)/i);
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return seconds * 1000;
}

async function loadDueRows(): Promise<CleanupRow[]> {
  const { data, error } = await db
    .from("telegram_message_cleanup")
    .select("id, chat_id, message_id, attempts")
    .eq("state", "pending")
    .is("deleted_at", null)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .order("message_id", { ascending: false })
    .limit(BATCH_SIZE);

  if (error) {
    throw new Error(`load cleanup queue failed: ${error.message}`);
  }

  return (data ?? []) as CleanupRow[];
}

async function markDeleted(id: number): Promise<void> {
  const { error } = await db
    .from("telegram_message_cleanup")
    .update({ deleted_at: new Date().toISOString(), state: "deleted", last_error: null })
    .eq("id", id);

  if (error) {
    throw new Error(`mark deleted failed: ${error.message}`);
  }
}

async function markNotFound(id: number): Promise<void> {
  const { error } = await db
    .from("telegram_message_cleanup")
    .update({
      state: "not_found",
      last_error: "Telegram: message to delete not found (already deleted or unavailable)",
    })
    .eq("id", id);

  if (error) {
    throw new Error(`mark not_found failed: ${error.message}`);
  }
}

async function markRetryOrFail(
  row: CleanupRow,
  errorText: string,
  retryDelayMs: number | null = null,
): Promise<void> {
  const attempt = nextAttempt(row.attempts);
  const nextState = attempt >= MAX_DELETE_ATTEMPTS ? "failed" : "pending";
  const dueAt = retryDelayMs === null ? getRetryDueAtIso() : getRetryDueAtIsoWithMs(retryDelayMs);

  const { error } = await db
    .from("telegram_message_cleanup")
    .update({
      attempts: attempt,
      state: nextState,
      due_at: dueAt,
      last_error: errorText,
    })
    .eq("id", row.id);

  if (error) {
    throw new Error(`mark retry/failed failed: ${error.message}`);
  }
}

async function pruneOldContext(): Promise<number> {
  const { count, error } = await db
    .from("chat_context_messages")
    .delete({ count: "exact" })
    .lt("created_at", getContextCutoffIso());

  if (error) {
    throw new Error(`context prune failed: ${error.message}`);
  }

  return Number(count ?? 0);
}

Deno.serve(async (req) => {
  try {
    const methodError = ensurePost(req);
    if (methodError) {
      return methodError;
    }

    const rows = await loadDueRows();

    let deletedCount = 0;
    let failedCount = 0;
    const failedItems: FailedItem[] = [];

    for (const row of rows) {
      try {
        await deleteTelegramMessage(Number(row.chat_id), Number(row.message_id));
        await markDeleted(row.id);
        deletedCount += 1;
      } catch (errorItem) {
        const errorText = String(errorItem);
        const notFound = errorText.includes("message to delete not found");
        const retryAfterMs = extractRetryAfterMs(errorText);
        if (notFound) {
          try {
            await markNotFound(row.id);
            deletedCount += 1;
            continue;
          } catch (markError) {
            console.error("cleanup mark-not-found error", markError);
          }
        }

        try {
          await markRetryOrFail(row, errorText, retryAfterMs);
        } catch (markError) {
          console.error("cleanup retry-state update error", markError);
        }

        failedCount += 1;
        if (failedItems.length < 20) {
          failedItems.push({
            chatId: Number(row.chat_id),
            messageId: Number(row.message_id),
            error: errorText,
          });
        }
      }

      if ((deletedCount + failedCount) % 50 === 0) {
        console.log(
          "cleanup-messages progress",
          JSON.stringify({
            processed: deletedCount + failedCount,
            deletedCount,
            failedCount,
            queueSize: rows.length,
          }),
        );
      }
    }

    const contextPrunedCount = await pruneOldContext();
    console.log(
      "cleanup-messages done",
      JSON.stringify({ deletedCount, failedCount, queueSize: rows.length, contextPrunedCount }),
    );

    return json({
      ok: true,
      deletedCount,
      failedCount,
      queueSize: rows.length,
      contextPrunedCount,
      failedItems,
    });
  } catch (error) {
    console.error("cleanup-messages error", error);
    return json({ ok: false, error: String(error) }, 500);
  }
});
