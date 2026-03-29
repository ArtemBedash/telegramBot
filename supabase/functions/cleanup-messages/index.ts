import { db } from "../_shared/supabase.ts";
import { deleteTelegramMessage } from "../_shared/telegram.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const nowIso = new Date().toISOString();

    const { data: rows, error } = await db
      .from("telegram_message_cleanup")
      .select("id, chat_id, message_id, attempts")
      .is("deleted_at", null)
      .lte("due_at", nowIso)
      .order("due_at", { ascending: true })
      .limit(200);

    if (error) {
      throw new Error(`load cleanup queue failed: ${error.message}`);
    }

    let deletedCount = 0;
    let failedCount = 0;

    for (const row of rows) {
      try {
        await deleteTelegramMessage(Number(row.chat_id), Number(row.message_id));

        const { error: updateError } = await db
          .from("telegram_message_cleanup")
          .update({ deleted_at: new Date().toISOString(), last_error: null })
          .eq("id", row.id);

        if (updateError) {
          throw new Error(`mark deleted failed: ${updateError.message}`);
        }

        deletedCount += 1;
      } catch (errorItem) {
        const { error: failUpdateError } = await db
          .from("telegram_message_cleanup")
          .update({
            attempts: Number(row.attempts ?? 0) + 1,
            last_error: String(errorItem),
          })
          .eq("id", row.id);

        if (failUpdateError) {
          console.error("cleanup update error", failUpdateError.message);
        }

        failedCount += 1;
      }
    }

    return json({ ok: true, deletedCount, failedCount, queueSize: rows.length });
  } catch (error) {
    console.error("cleanup-messages error", error);
    return json({ ok: false, error: String(error) }, 500);
  }
});
