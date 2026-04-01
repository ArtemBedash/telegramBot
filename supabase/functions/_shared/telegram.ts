const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

if (!telegramToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

const baseUrl = `https://api.telegram.org/bot${telegramToken}`;

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: {
    retry_after?: number;
  };
};

async function callTelegramApi<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramApiResponse<T>> {
  const response = await fetch(`${baseUrl}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data: TelegramApiResponse<T>;
  try {
    data = (await response.json()) as TelegramApiResponse<T>;
  } catch {
    data = {
      ok: false,
      description: "Telegram API returned non-JSON response",
    };
  }

  if (!response.ok && data.ok) {
    data.ok = false;
  }

  return data;
}

function throwTelegramError(method: string, data: TelegramApiResponse<unknown>): never {
  throw new Error(`Telegram ${method} failed: ${JSON.stringify(data)}`);
}

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  options: {
    parse_mode?: "HTML" | "MarkdownV2" | null;
    reply_markup?: Record<string, unknown>;
  } = {},
): Promise<number> {
  const data = await callTelegramApi<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode ?? "HTML",
    reply_markup: options.reply_markup,
  });

  if (!data.ok || !data.result) {
    throwTelegramError("sendMessage", data);
  }

  return Number(data.result.message_id);
}

export async function deleteTelegramMessage(chatId: number, messageId: number): Promise<void> {
  const data = await callTelegramApi<boolean>("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });

  if (!data.ok) {
    throwTelegramError("deleteMessage", data);
  }
}

export type TelegramChatMember = {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  can_delete_messages?: boolean;
};

export async function getTelegramMe(): Promise<{ id: number; username?: string }> {
  const data = await callTelegramApi<{ id: number; username?: string }>("getMe", {});
  if (!data.ok || !data.result) {
    throwTelegramError("getMe", data);
  }
  return data.result;
}

export async function getTelegramChatMember(chatId: number, userId: number): Promise<TelegramChatMember> {
  const data = await callTelegramApi<TelegramChatMember>("getChatMember", {
    chat_id: chatId,
    user_id: userId,
  });
  if (!data.ok || !data.result) {
    throwTelegramError("getChatMember", data);
  }
  return data.result;
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text: string,
  showAlert = false,
): Promise<void> {
  const data = await callTelegramApi<boolean>("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
  if (!data.ok) {
    throwTelegramError("answerCallbackQuery", data);
  }
}

export async function editTelegramMessageText(
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  const data = await callTelegramApi<boolean>("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  });

  if (!data.ok) {
    throwTelegramError("editMessageText", data);
  }
}
