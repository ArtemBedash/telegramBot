import { BOT_USERNAME, CONTEXT_TTL_MS, SYSTEM_PROMPT } from "../_shared/constants.ts";
import { formatMessage } from "../_shared/format.ts";
import { createChatCompletion, type ChatMessage } from "../_shared/openai.ts";
import { db } from "../_shared/supabase.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";

type TelegramUpdate = {
  message?: {
    message_id: number;
    text?: string;
    chat: {
      id: number;
      type: string;
    };
  };
};

type ContextRow = {
  role: "user" | "assistant";
  content: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getTtlCutoffIso(): string {
  return new Date(Date.now() - CONTEXT_TTL_MS).toISOString();
}

function hasGroupMention(text: string, chatType: string): boolean {
  if (!chatType.includes("group")) {
    return true;
  }
  return text.includes(`@${BOT_USERNAME}`);
}

async function ensureChatSettings(chatId: number): Promise<void> {
  const { error } = await db
    .from("telegram_chat_settings")
    .upsert({ chat_id: chatId }, { onConflict: "chat_id" });

  if (error) {
    throw new Error(`ensureChatSettings failed: ${error.message}`);
  }
}

async function pruneContext(chatId: number): Promise<void> {
  const { error } = await db
    .from("chat_context_messages")
    .delete()
    .eq("chat_id", chatId)
    .lt("created_at", getTtlCutoffIso());

  if (error) {
    throw new Error(`pruneContext failed: ${error.message}`);
  }
}

async function loadContext(chatId: number): Promise<ContextRow[]> {
  const { data, error } = await db
    .from("chat_context_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .gte("created_at", getTtlCutoffIso())
    .order("created_at", { ascending: true })
    .limit(30);

  if (error) {
    throw new Error(`loadContext failed: ${error.message}`);
  }

  return data;
}

async function saveContext(chatId: number, userContent: string, assistantContent: string): Promise<void> {
  const { error } = await db.from("chat_context_messages").insert([
    { chat_id: chatId, role: "user", content: userContent },
    { chat_id: chatId, role: "assistant", content: assistantContent },
  ]);

  if (error) {
    throw new Error(`saveContext failed: ${error.message}`);
  }
}

async function scheduleCleanup(chatId: number, messageId: number, ttlMs: number): Promise<void> {
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
    throw new Error(`scheduleCleanup failed: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (webhookSecret) {
      const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token");
      if (incomingSecret !== webhookSecret) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const update = (await req.json()) as TelegramUpdate;
    const message = update.message;

    if (!message?.text) {
      return json({ ok: true, skipped: "no-text-message" });
    }

    const chatId = Number(message.chat.id);
    const inputText = message.text;

    if (!hasGroupMention(inputText, message.chat.type)) {
      return json({ ok: true, skipped: "group-message-without-mention" });
    }

    await ensureChatSettings(chatId);
    await pruneContext(chatId);

    const context = await loadContext(chatId);
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...context,
      { role: "user", content: inputText },
    ];

    const reply = await createChatCompletion(messages);
    const replyMessageId = await sendTelegramMessage(chatId, formatMessage(reply));

    await saveContext(chatId, inputText, reply);
    await scheduleCleanup(chatId, Number(message.message_id), CONTEXT_TTL_MS);
    await scheduleCleanup(chatId, replyMessageId, CONTEXT_TTL_MS);

    return json({ ok: true });
  } catch (error) {
    console.error("telegram-webhook error", error);
    return json({ ok: false, error: String(error) }, 500);
  }
});
