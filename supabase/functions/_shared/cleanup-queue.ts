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
      state: "pending",
      deleted_at: null,
      attempts: 0,
      last_error: null,
    },
    { onConflict: "chat_id,message_id" },
  );

  if (error) {
    throw new Error(`enqueueMessageCleanup failed: ${error.message}`);
  }
}

export async function enqueueCleanupRange(
  chatId: number,
  fromMessageId: number,
  toMessageId = 1,
): Promise<number> {
  const upper = Math.max(fromMessageId, toMessageId);
  const lower = Math.min(fromMessageId, toMessageId);

  const { data, error } = await db.rpc("enqueue_cleanup_range", {
    p_chat_id: chatId,
    p_from_message_id: upper,
    p_to_message_id: lower,
  });

  if (error) {
    throw new Error(`enqueueCleanupRange failed: ${error.message}`);
  }

  return Number(data ?? 0);
}
