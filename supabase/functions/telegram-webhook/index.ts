import { BOT_USERNAME, CONTEXT_TTL_MS, SYSTEM_PROMPT } from "../_shared/constants.ts";
import { enqueueCleanupRange, enqueueMessageCleanup } from "../_shared/cleanup-queue.ts";
import { formatMessage } from "../_shared/format.ts";
import { ensurePost, json } from "../_shared/http.ts";
import { createChatCompletion, type ChatMessage } from "../_shared/openai.ts";
import { db } from "../_shared/supabase.ts";
import {
  answerTelegramCallbackQuery,
  banTelegramUser,
  deleteTelegramMessage,
  editTelegramMessageText,
  getTelegramChatMember,
  getTelegramMe,
  sendTelegramMessage,
} from "../_shared/telegram.ts";

type TelegramUpdate = {
  message?: {
    message_id: number;
    text?: string;
    from?: {
      id?: number;
      is_bot?: boolean;
    };
    reply_to_message?: {
      from?: {
        id?: number;
        is_bot?: boolean;
        username?: string;
      };
    };
    chat: {
      id: number;
      type: string;
    };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: {
      id: number;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
      };
    };
  };
};

type ContextRow = {
  role: "user" | "assistant";
  content: string;
};

// @ts-ignore
const requireMentionInGroup = (Deno.env.get("REQUIRE_MENTION_IN_GROUP") ?? "true") === "true";
const botUserId = Number(Deno.env.get("BOT_USER_ID") ?? "0");
const profanityRegex =
  /(^|[^\p{L}\p{N}_])(сук\p{L}*|бля\p{L}*|ху[йеёияю]\p{L}*|пизд\p{L}*|еб\p{L}*|ёб\p{L}*|нах\p{L}*|муд\p{L}*|гандон\p{L}*)(?=$|[^\p{L}\p{N}_])/iu;

function getTtlCutoffIso(): string {
  return new Date(Date.now() - CONTEXT_TTL_MS).toISOString();
}

function hasBotMention(text: string): boolean {
  return text.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`);
}

function isReplyToBot(
  replyToMessage: TelegramUpdate["message"]["reply_to_message"] | undefined,
): boolean {
  const from = replyToMessage?.from;
  if (!from?.is_bot) {
    return false;
  }

  if (typeof from.username === "string" && from.username.toLowerCase() === BOT_USERNAME.toLowerCase()) {
    return true;
  }

  if (botUserId > 0 && Number(from.id) === botUserId) {
    return true;
  }

  return false;
}

function canProcessGroupMessage(
  text: string,
  chatType: string,
  replyToMessage: TelegramUpdate["message"]["reply_to_message"] | undefined,
): boolean {
  if (!chatType.includes("group") || !requireMentionInGroup) {
    return true;
  }

  return hasBotMention(text) || isReplyToBot(replyToMessage);
}

function containsProfanity(text: string): boolean {
  const normalized = text.toLowerCase().replace(/ё/g, "е");
  return profanityRegex.test(normalized);
}

const CLEANUP_COMMAND_REGEX = /^\/cleanup(?:@\w+)?(?:\s+.+)?$/i;
const CLEANUP_ACTION_PREFIX = "cln";
const CLEANUP_CONFIRM_TTL_MS = Number(Deno.env.get("CLEANUP_CONFIRM_TTL_MS") ?? 2 * 60 * 1000);
const PROFANITY_WARNING_DELETE_TTL_MS = Number(
  Deno.env.get("PROFANITY_WARNING_DELETE_TTL_MS") ?? 30_000,
);
const PROFANITY_BAN_SECONDS = Math.max(30, Number(Deno.env.get("PROFANITY_BAN_SECONDS") ?? 30));
const PROFANITY_SONG_TEXT =
  Deno.env.get("PROFANITY_SONG_TEXT") ??
  [
    "Песенка про правила группы:",
    "Без матов говорим, без грубых слов в эфир,",
    "Уважение к людям держит в порядке целый мир.",
    "Нарушил это правило - получишь бан на срок,",
    "Вернись и пиши нормально, это главный наш урок.",
  ].join("\n");

type CleanupActionData = {
  action: "confirm" | "cancel";
  chatId: number;
  userId: number;
  fromMessageId: number;
  expiresAt: number;
};

type CleanupCommandMode = "all" | "profanity-on" | "profanity-off";

function buildCleanupActionData(action: "confirm" | "cancel", payload: Omit<CleanupActionData, "action">): string {
  const actionCode = action === "confirm" ? "c" : "x";
  return [
    CLEANUP_ACTION_PREFIX,
    actionCode,
    payload.chatId.toString(36),
    payload.userId.toString(36),
    payload.fromMessageId.toString(36),
    payload.expiresAt.toString(36),
  ].join(":");
}

function parseCleanupActionData(data: string | undefined): CleanupActionData | null {
  if (!data) {
    return null;
  }

  const parts = data.split(":");
  if (parts.length !== 6 || parts[0] !== CLEANUP_ACTION_PREFIX) {
    return null;
  }

  const actionCode = parts[1];
  const action = actionCode === "c" ? "confirm" : actionCode === "x" ? "cancel" : null;
  if (!action) {
    return null;
  }

  const chatId = parseInt(parts[2], 36);
  const userId = parseInt(parts[3], 36);
  const fromMessageId = parseInt(parts[4], 36);
  const expiresAt = parseInt(parts[5], 36);

  if (
    !Number.isFinite(chatId) ||
    !Number.isFinite(userId) ||
    !Number.isFinite(fromMessageId) ||
    !Number.isFinite(expiresAt)
  ) {
    return null;
  }

  return {
    action,
    chatId,
    userId,
    fromMessageId,
    expiresAt,
  };
}

function parseCleanupCommandMode(text: string): CleanupCommandMode {
  const normalized = text.trim().toLowerCase();
  const withoutCommand = normalized.replace(/^\/cleanup(?:@\w+)?\s*/i, "").trim();

  if (!withoutCommand || withoutCommand === "all" || withoutCommand === "full") {
    return "all";
  }

  if (
    withoutCommand === "profanity" ||
    withoutCommand === "badwords" ||
    withoutCommand === "mat" ||
    withoutCommand === "маты"
  ) {
    return "profanity-on";
  }

  if (
    withoutCommand === "profanity off" ||
    withoutCommand === "profanity_off" ||
    withoutCommand === "badwords off" ||
    withoutCommand === "off" ||
    withoutCommand === "stop"
  ) {
    return "profanity-off";
  }

  return "all";
}

async function ensureBotCanDeleteMessages(chatId: number): Promise<boolean> {
  const bot = await getTelegramMe();
  const member = await getTelegramChatMember(chatId, Number(bot.id));

  if (member.status === "creator") {
    return true;
  }

  return member.status === "administrator" && member.can_delete_messages === true;
}

async function getProfanityCleanupEnabled(chatId: number): Promise<boolean> {
  const { data, error } = await db
    .from("telegram_chat_settings")
    .select("profanity_cleanup_enabled")
    .eq("chat_id", chatId)
    .maybeSingle();

  if (error) {
    throw new Error(`getProfanityCleanupEnabled failed: ${error.message}`);
  }

  return data?.profanity_cleanup_enabled === true;
}

async function setProfanityCleanupEnabled(chatId: number, enabled: boolean): Promise<void> {
  const { error } = await db
    .from("telegram_chat_settings")
    .upsert({ chat_id: chatId, profanity_cleanup_enabled: enabled }, { onConflict: "chat_id" });

  if (error) {
    throw new Error(`setProfanityCleanupEnabled failed: ${error.message}`);
  }
}

async function handleCleanupCommand(
  chatId: number,
  userId: number,
  messageId: number,
  mode: CleanupCommandMode,
  inputText: string,
): Promise<void> {
  if (mode === "profanity-on") {
    const canDelete = await ensureBotCanDeleteMessages(chatId);
    if (!canDelete) {
      await sendTelegramMessage(
        chatId,
        "Для режима profanity-cleanup мне нужен админ-доступ с правом <b>Delete messages</b>.",
      );
      return;
    }

    await setProfanityCleanupEnabled(chatId, true);
    await sendTelegramMessage(
      chatId,
      "Режим очистки матов включен: новые сообщения с матами будут удаляться автоматически.",
    );
    return;
  }

  if (mode === "profanity-off") {
    await setProfanityCleanupEnabled(chatId, false);
    await sendTelegramMessage(chatId, "Режим очистки матов выключен.");
    return;
  }

  const canDelete = await ensureBotCanDeleteMessages(chatId);
  if (!canDelete) {
    await sendTelegramMessage(
      chatId,
      "Я должен быть админом с правом <b>Delete messages</b>, иначе чистка не запустится.",
    );
    return;
  }

  const expiresAt = Date.now() + CLEANUP_CONFIRM_TTL_MS;
  const payload = { chatId, userId, fromMessageId: messageId, expiresAt };
  const normalized = inputText.trim().toLowerCase();
  const hasDateHint = /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(normalized) ||
    normalized.includes("до") ||
    normalized.includes("until");

  await sendTelegramMessage(
    chatId,
    [
      "Подтвердить массовую очистку?",
      ...(hasDateHint
        ? ["Фильтр по дате через Bot API недоступен, запускаю удаление всего доступного."]
        : []),
      `Поставлю в очередь удаление сообщений с id ${messageId} до 1.`,
      "Важно: Telegram Bot API не сможет удалить часть старых/недоступных сообщений.",
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Confirm cleanup", callback_data: buildCleanupActionData("confirm", payload) },
            { text: "Cancel", callback_data: buildCleanupActionData("cancel", payload) },
          ],
        ],
      },
    },
  );
}

async function handleCleanupCallback(
  callback: NonNullable<TelegramUpdate["callback_query"]>,
  cleanupEndpoint: string,
): Promise<{ ok: true; handled: string }> {
  const parsed = parseCleanupActionData(callback.data);
  if (!parsed) {
    await answerTelegramCallbackQuery(callback.id, "Некорректная команда cleanup", true);
    return { ok: true, handled: "cleanup-invalid-callback" };
  }

  if (Date.now() > parsed.expiresAt) {
    await answerTelegramCallbackQuery(callback.id, "Подтверждение истекло. Запусти /cleanup снова.", true);
    return { ok: true, handled: "cleanup-expired" };
  }

  if (callback.from.id !== parsed.userId) {
    await answerTelegramCallbackQuery(
      callback.id,
      "Подтверждать cleanup может только тот, кто запустил команду.",
      true,
    );
    return { ok: true, handled: "cleanup-not-owner" };
  }

  if (callback.message && Number(callback.message.chat.id) !== parsed.chatId) {
    await answerTelegramCallbackQuery(callback.id, "Неверный чат для cleanup", true);
    return { ok: true, handled: "cleanup-wrong-chat" };
  }

  if (parsed.action === "cancel") {
    await answerTelegramCallbackQuery(callback.id, "Очистка отменена");
    if (callback.message) {
      await editTelegramMessageText(
        parsed.chatId,
        callback.message.message_id,
        "Очистка отменена.",
      );
    }
    return { ok: true, handled: "cleanup-cancelled" };
  }

  await answerTelegramCallbackQuery(callback.id, "Запускаю cleanup...");
  await ensureChatSettings(parsed.chatId);
  const queued = await enqueueCleanupRange(parsed.chatId, parsed.fromMessageId, 1);
  try {
    await fetch(cleanupEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "cleanup-confirm" }),
    });
  } catch (kickoffError) {
    console.error("cleanup kickoff failed", kickoffError);
  }

  if (callback.message) {
    await editTelegramMessageText(
      parsed.chatId,
      callback.message.message_id,
      [
        "Cleanup запущен.",
        `Поставлено в очередь: ${queued} сообщений.`,
        "Удаление идет батчами через cleanup-messages.",
      ].join("\n"),
    );
  } else {
    await sendTelegramMessage(
      parsed.chatId,
      `Cleanup запущен. В очереди ${queued} сообщений.`,
    );
  }

  return { ok: true, handled: "cleanup-confirmed" };
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

Deno.serve(async (req) => {
  try {
    const methodError = ensurePost(req);
    if (methodError) {
      return methodError;
    }

    const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (webhookSecret && req.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const update = (await req.json()) as TelegramUpdate;
    const cleanupEndpoint = new URL("/cleanup-messages", req.url).toString();
    const callback = update.callback_query;
    if (callback?.data?.startsWith(CLEANUP_ACTION_PREFIX)) {
      const result = await handleCleanupCallback(callback, cleanupEndpoint);
      return json(result);
    }

    const message = update.message;

    if (!message?.text) {
      return json({ ok: true, skipped: "no-text-message" });
    }

    const chatId = Number(message.chat.id);
    const inputText = message.text;
    const fromBot = message.from?.is_bot === true;
    const fromUserId = Number(message.from?.id ?? 0);

    if (fromBot) {
      return json({ ok: true, skipped: "bot-message" });
    }

    if (CLEANUP_COMMAND_REGEX.test(inputText)) {
      if (!message.chat.type.includes("group")) {
        await sendTelegramMessage(chatId, "Команда /cleanup работает только в группах.");
        return json({ ok: true, skipped: "cleanup-private-chat" });
      }

      if (!Number.isFinite(fromUserId) || fromUserId <= 0) {
        return json({ ok: true, skipped: "cleanup-no-user-id" });
      }

      const mode = parseCleanupCommandMode(inputText);
      await handleCleanupCommand(chatId, fromUserId, Number(message.message_id), mode, inputText);
      return json({ ok: true, handled: "cleanup-command" });
    }

    if (containsProfanity(inputText)) {
      const profanityCleanupEnabled = await getProfanityCleanupEnabled(chatId);
      const canBanUser = Number.isFinite(fromUserId) && fromUserId > 0;

      if (profanityCleanupEnabled && canBanUser) {
        try {
          const untilDateUnix = Math.floor(Date.now() / 1000) + PROFANITY_BAN_SECONDS;
          await banTelegramUser(chatId, fromUserId, {
            revokeMessages: true,
            untilDateUnix,
          });
        } catch (banError) {
          console.error("profanity ban failed", banError);
          try {
            await deleteTelegramMessage(chatId, Number(message.message_id));
          } catch (deleteError) {
            console.error("profanity delete failed", deleteError);
          }
        }
      }

      const warningMessageId = await sendTelegramMessage(
        chatId,
        profanityCleanupEnabled
          ? `${PROFANITY_SONG_TEXT}\n\nПредупреждение: мат запрещен. Нарушитель отправлен в бан на ${PROFANITY_BAN_SECONDS} сек.`
          : "Не матерись, пожалуйста. Для авто-удаления включи: /cleanup profanity",
      );
      await enqueueMessageCleanup(chatId, warningMessageId, PROFANITY_WARNING_DELETE_TTL_MS);

      return json({ ok: true, moderated: "profanity-warning" });
    }

    if (!canProcessGroupMessage(inputText, message.chat.type, message.reply_to_message)) {
      return json({ ok: true, skipped: "group-message-without-mention-or-reply" });
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
    await enqueueMessageCleanup(chatId, Number(message.message_id), CONTEXT_TTL_MS);
    await enqueueMessageCleanup(chatId, replyMessageId, CONTEXT_TTL_MS);

    return json({ ok: true });
  } catch (error) {
    console.error("telegram-webhook error", error);
    return json({ ok: false, error: String(error) }, 500);
  }
});
