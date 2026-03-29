import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export const env = {
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  openAiApiKey: requireEnv("OPENAI_API_KEY"),
  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  dailyChatId: process.env.DAILY_CHAT_ID ? Number(process.env.DAILY_CHAT_ID) : null,
  port: Number(process.env.PORT ?? 3000),
};
