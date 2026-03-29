export const BOT_USERNAME = "frontend_guy_bot";

export const SYSTEM_PROMPT =
  "Ты эксперт по JS, TS и React. Отвечай коротко и лаконично, максимум 5-7 предложений , понятными для собеседования. Не обрезай свой ответ, пиши полностью";

export const CONTEXT_TTL_MS = 4 * 60 * 60 * 1000;
export const DAILY_MESSAGE_DELETE_TTL_MS = 24 * 60 * 60 * 1000;

export const DAILY_CRON = "25 11 * * *";
export const APP_TIMEZONE = "Asia/Jerusalem";

export const BOT_STATE_KEYS = {
  DAILY_CHAT_ID: "daily_chat_id",
} as const;
