import { Telegraf } from "telegraf";
import { APP_TIMEZONE, DAILY_MESSAGE_DELETE_TTL_MS } from "../config/constants.js";
import { questions } from "../data/questions.js";
import { supabase } from "../lib/supabase.js";
import { ensureChatSettings, isDailyQuestionsEnabled } from "./state.service.js";

function getTodayDateInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function acquireDailySendLock(chatId: number, sendDate: string): Promise<boolean> {
  const { error } = await supabase.from("daily_question_send_lock").insert({
    chat_id: chatId,
    send_date: sendDate,
  });

  if (!error) {
    return true;
  }

  if (error.code === "23505") {
    return false;
  }

  console.error("Ошибка lock daily_question_send_lock:", error.message);
  return false;
}

export async function maybeSendDailyQuestion(bot: Telegraf, chatId: number): Promise<void> {
  await ensureChatSettings(chatId);

  const enabled = await isDailyQuestionsEnabled(chatId);
  if (!enabled) {
    return;
  }

  const sendDate = getTodayDateInTimezone(APP_TIMEZONE);
  const lockAcquired = await acquireDailySendLock(chatId, sendDate);
  if (!lockAcquired) {
    return;
  }

  const question = questions[Math.floor(Math.random() * questions.length)];
  const sentMessage = await bot.telegram.sendMessage(chatId, question);

  const { error: logError } = await supabase.from("daily_question_log").insert({
    chat_id: chatId,
    telegram_message_id: sentMessage.message_id,
    question,
  });

  if (logError) {
    console.error("Ошибка записи daily_question_log:", logError.message);
  }

  setTimeout(async () => {
    try {
      await bot.telegram.deleteMessage(chatId, sentMessage.message_id);
      const { error } = await supabase
        .from("daily_question_log")
        .update({ deleted_at: new Date().toISOString() })
        .eq("chat_id", chatId)
        .eq("telegram_message_id", sentMessage.message_id);

      if (error) {
        console.error("Ошибка обновления deleted_at daily_question_log:", error.message);
      }
    } catch (err) {
      console.error("Ошибка при удалении ежедневного вопроса:", err);
    }
  }, DAILY_MESSAGE_DELETE_TTL_MS);

  console.log("Вопрос дня отправлен:", question);
}
