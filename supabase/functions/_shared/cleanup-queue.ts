import { db } from "./supabase.ts";

export async function enqueueMessageCleanup(
  chatId: number,
  messageId: number,
  ttlMs: number,
): Promise<void> {
  const dueAt = new Date(Date.now() + ttlMs).toISOString();

  const { error } = await db.from("telegram_message_cleanup").upsert(
    {
      chat_id: chatId,
      message_id: messageId,
      due_at: dueAt,
    },
    { onConflict: "chat_id,message_id" },
  );

  if (error) {
    throw new Error(`enqueueMessageCleanup failed: ${error.message}`);
  }
}
