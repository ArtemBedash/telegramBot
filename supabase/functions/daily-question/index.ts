import { APP_TIMEZONE, DAILY_MESSAGE_DELETE_TTL_MS, QUESTIONS } from "../_shared/constants.ts";
import { db } from "../_shared/supabase.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getDateInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function ensureDailyChatFromEnv(): Promise<void> {
  const raw = Deno.env.get("DAILY_CHAT_ID");
  if (!raw) {
    return;
  }

  const chatId = Number(raw);
  if (!Number.isFinite(chatId)) {
    throw new Error("DAILY_CHAT_ID is not a valid number");
  }

  const { error } = await db
    .from("telegram_chat_settings")
    .upsert({ chat_id: chatId }, { onConflict: "chat_id" });

  if (error) {
    throw new Error(`ensureDailyChatFromEnv failed: ${error.message}`);
  }
}

async function cleanupOldLocks(): Promise<void> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { error } = await db
    .from("daily_question_send_lock")
    .delete()
    .lt("send_date", cutoff);

  if (error) {
    throw new Error(`cleanupOldLocks failed: ${error.message}`);
  }
}

async function acquireSendLock(chatId: number, sendDate: string): Promise<boolean> {
  const { error } = await db
    .from("daily_question_send_lock")
    .insert({ chat_id: chatId, send_date: sendDate });

  if (!error) {
    return true;
  }

  if (error.code === "23505") {
    return false;
  }

  throw new Error(`acquireSendLock failed: ${error.message}`);
}

async function scheduleCleanup(chatId: number, messageId: number): Promise<void> {
  const dueAt = new Date(Date.now() + DAILY_MESSAGE_DELETE_TTL_MS).toISOString();
  const { error } = await db.from("telegram_message_cleanup").upsert(
    {
      chat_id: chatId,
      message_id: messageId,
      due_at: dueAt,
    },
    { onConflict: "chat_id,message_id" },
  );

  if (error) {
    throw new Error(`scheduleCleanup failed: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret) {
      const incomingSecret = req.headers.get("x-cron-secret");
      if (incomingSecret !== cronSecret) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    await ensureDailyChatFromEnv();
    await cleanupOldLocks();

    const { data: chats, error: chatsError } = await db
      .from("telegram_chat_settings")
      .select("chat_id, timezone, daily_questions_enabled")
      .eq("daily_questions_enabled", true);

    if (chatsError) {
      throw new Error(`load chats failed: ${chatsError.message}`);
    }

    let sentCount = 0;

    for (const chat of chats) {
      const chatId = Number(chat.chat_id);
      const timezone = chat.timezone || APP_TIMEZONE;
      const sendDate = getDateInTimezone(timezone);

      const lockAcquired = await acquireSendLock(chatId, sendDate);
      if (!lockAcquired) {
        continue;
      }

      const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
      const messageId = await sendTelegramMessage(chatId, question);

      const { error: logError } = await db.from("daily_question_log").insert({
        chat_id: chatId,
        telegram_message_id: messageId,
        question,
      });

      if (logError) {
        throw new Error(`insert daily_question_log failed: ${logError.message}`);
      }

      await scheduleCleanup(chatId, messageId);
      sentCount += 1;
    }

    return json({ ok: true, sentCount, chatsTotal: chats.length });
  } catch (error) {
    console.error("daily-question error", error);
    return json({ ok: false, error: String(error) }, 500);
  }
});
