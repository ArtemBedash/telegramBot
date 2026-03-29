import type { Json } from "../lib/database.types.js";
import { supabase } from "../lib/supabase.js";

export async function getBotState<T = Json>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from("bot_state")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error(`Ошибка чтения bot_state (${key}):`, error.message);
    return null;
  }

  return (data?.value as T | undefined) ?? null;
}

export async function setBotState(key: string, value: Json): Promise<void> {
  const { error } = await supabase.from("bot_state").upsert({ key, value }, { onConflict: "key" });
  if (error) {
    console.error(`Ошибка записи bot_state (${key}):`, error.message);
  }
}

export async function ensureChatSettings(chatId: number): Promise<void> {
  const { error } = await supabase
    .from("telegram_chat_settings")
    .upsert({ chat_id: chatId }, { onConflict: "chat_id" });

  if (error) {
    console.error("Ошибка upsert telegram_chat_settings:", error.message);
  }
}

export async function isDailyQuestionsEnabled(chatId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("telegram_chat_settings")
    .select("daily_questions_enabled")
    .eq("chat_id", chatId)
    .maybeSingle();

  if (error) {
    console.error("Ошибка чтения daily_questions_enabled:", error.message);
    return true;
  }

  if (!data) {
    return true;
  }

  return data.daily_questions_enabled;
}
