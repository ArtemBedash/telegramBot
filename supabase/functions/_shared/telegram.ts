const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

if (!telegramToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

const baseUrl = `https://api.telegram.org/bot${telegramToken}`;

export async function sendTelegramMessage(chatId: number, text: string): Promise<number> {
  const response = await fetch(`${baseUrl}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram sendMessage failed: ${JSON.stringify(data)}`);
  }

  return Number(data.result.message_id);
}

export async function deleteTelegramMessage(chatId: number, messageId: number): Promise<void> {
  const response = await fetch(`${baseUrl}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram deleteMessage failed: ${JSON.stringify(data)}`);
  }
}
