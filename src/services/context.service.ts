import { CONTEXT_TTL_MS } from "../config/constants.js";
import { supabase } from "../lib/supabase.js";

export type ContextMessage = {
  role: "user" | "assistant";
  content: string;
};

function getTtlCutoffIso(): string {
  return new Date(Date.now() - CONTEXT_TTL_MS).toISOString();
}

export async function pruneContext(chatId: number): Promise<void> {
  const { error } = await supabase
    .from("chat_context_messages")
    .delete()
    .eq("chat_id", chatId)
    .lt("created_at", getTtlCutoffIso());

  if (error) {
    console.error("Ошибка очистки старого контекста:", error.message);
  }
}

export async function getChatContext(chatId: number): Promise<ContextMessage[]> {
  const { data, error } = await supabase
    .from("chat_context_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .gte("created_at", getTtlCutoffIso())
    .order("created_at", { ascending: true })
    .limit(30);

  if (error) {
    console.error("Ошибка чтения chat_context_messages:", error.message);
    return [];
  }

  return data;
}

export async function appendContextPair(
  chatId: number,
  userContent: string,
  assistantContent: string,
): Promise<void> {
  const { error } = await supabase.from("chat_context_messages").insert([
    { chat_id: chatId, role: "user", content: userContent },
    { chat_id: chatId, role: "assistant", content: assistantContent },
  ]);

  if (error) {
    console.error("Ошибка записи chat_context_messages:", error.message);
  }
}
