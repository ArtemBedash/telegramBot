import express from "express";
import cron from "node-cron";
import OpenAI from "openai";
import { Telegraf } from "telegraf";
import type { Context } from "telegraf";
import type { Update, Message } from "telegraf/types";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  APP_TIMEZONE,
  BOT_STATE_KEYS,
  BOT_USERNAME,
  CONTEXT_TTL_MS,
  DAILY_CRON,
  SYSTEM_PROMPT,
} from "./config/constants.js";
import { env } from "./config/env.js";
import { formatMessage } from "./utils/format-message.js";
import { appendContextPair, getChatContext, pruneContext } from "./services/context.service.js";
import { maybeSendDailyQuestion } from "./services/daily-question.service.js";
import { ensureChatSettings, getBotState, setBotState } from "./services/state.service.js";

const bot = new Telegraf(env.telegramBotToken);
const openai = new OpenAI({ apiKey: env.openAiApiKey });

type DailyChatState = { chatId?: number };

let dailyChatId: number | null = env.dailyChatId;

function mentionsBotInGroup(text: string, chatType: string): boolean {
  if (!chatType.includes("group")) {
    return true;
  }
  return text.includes(`@${BOT_USERNAME}`);
}

function buildMessages(text: string, context: { role: "user" | "assistant"; content: string }[]): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    ...context,
    {
      role: "user",
      content: text,
    },
  ];
}

async function getPersistedDailyChatId(): Promise<number | null> {
  const state = await getBotState<DailyChatState>(BOT_STATE_KEYS.DAILY_CHAT_ID);
  const parsed = Number(state?.chatId);
  return Number.isFinite(parsed) ? parsed : null;
}

async function setPersistedDailyChatId(chatId: number): Promise<void> {
  await setBotState(BOT_STATE_KEYS.DAILY_CHAT_ID, { chatId });
}

async function ensureDailyChatId(chatId: number): Promise<void> {
  if (dailyChatId !== null) {
    return;
  }

  dailyChatId = chatId;
  await setPersistedDailyChatId(chatId);
  console.log("chatId для ежедневного вопроса:", dailyChatId);
}

type TextCtx = Context<Update.MessageUpdate<Message.TextMessage>>;

async function handleIncomingText(ctx: TextCtx): Promise<void> {
  const chatId = Number(ctx.chat.id);
  const text = ctx.message.text;
  const chatType = ctx.chat.type;

  if (!mentionsBotInGroup(text, chatType)) {
    return;
  }

  await ensureDailyChatId(chatId);
  await ensureChatSettings(chatId);
  await pruneContext(chatId);

  const context = await getChatContext(chatId);
  const messages = buildMessages(text, context);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    max_tokens: 450,
  });

  const reply = response.choices[0]?.message?.content ?? "Не получилось сгенерировать ответ.";

  await appendContextPair(chatId, text, reply);

  const sentMessage = await ctx.reply(formatMessage(reply), { parse_mode: "HTML" });

  setTimeout(async () => {
    try {
      await ctx.deleteMessage(sentMessage.message_id);
      await ctx.deleteMessage(ctx.message.message_id);
    } catch (err: unknown) {
      console.error("Ошибка при удалении сообщений:", err);
    }
  }, CONTEXT_TTL_MS);
}

bot.on("text", async (ctx) => {
  try {
    await handleIncomingText(ctx);
  } catch (err) {
    console.error(err);
    await ctx.reply("Ошибка 🤖. Попробуй ещё раз.");
  }
});

async function bootstrapDailyQuestions(): Promise<void> {
  if (dailyChatId === null) {
    dailyChatId = await getPersistedDailyChatId();
  }

  if (dailyChatId === null) {
    return;
  }

  await ensureChatSettings(dailyChatId);
  await maybeSendDailyQuestion(bot, dailyChatId);
}

cron.schedule(
  DAILY_CRON,
  () => {
    if (dailyChatId === null) {
      return;
    }
    maybeSendDailyQuestion(bot, dailyChatId).catch((err: unknown) =>
      console.error("Ошибка cron sendDailyQuestion:", err),
    );
  },
  { timezone: APP_TIMEZONE },
);

bootstrapDailyQuestions().catch((err: unknown) =>
  console.error("Ошибка bootstrapDailyQuestions:", err),
);

bot.launch().catch((err: unknown) => console.error("Ошибка запуска бота:", err));
console.log("🤖 Бот запущен!");

const app = express();
app.get("/", (_req: express.Request, res: express.Response) => res.send("🤖 Bot is running"));
app.listen(env.port, () => console.log(`🌐 Server running on port ${env.port}`));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
