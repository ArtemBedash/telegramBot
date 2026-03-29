import { OPENAI_MODEL } from "./constants.ts";

const openAiApiKey = Deno.env.get("OPENAI_API_KEY");

if (!openAiApiKey) {
  throw new Error("OPENAI_API_KEY is not set");
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function createChatCompletion(messages: ChatMessage[]): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      max_tokens: 450,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI error: ${JSON.stringify(data)}`);
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || reply.length === 0) {
    return "Не получилось сгенерировать ответ.";
  }

  return reply;
}
