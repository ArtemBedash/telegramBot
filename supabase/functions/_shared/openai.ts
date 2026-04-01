import { OPENAI_MODEL, OPENAI_WEB_SEARCH_ENABLED, OPENAI_WEB_SEARCH_MODEL } from "./constants.ts";

const openAiApiKey = Deno.env.get("OPENAI_API_KEY");

if (!openAiApiKey) {
  throw new Error("OPENAI_API_KEY is not set");
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function getErrorText(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function extractResponseText(data: Record<string, unknown>): string | null {
  const outputText = data.output_text;
  if (typeof outputText === "string" && outputText.trim().length > 0) {
    return outputText.trim();
  }

  const output = data.output;
  if (!Array.isArray(output)) {
    return null;
  }

  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const chunk of content) {
      if (!chunk || typeof chunk !== "object") {
        continue;
      }

      const text = (chunk as { text?: unknown }).text;
      if (typeof text === "string" && text.trim().length > 0) {
        parts.push(text.trim());
      }
    }
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

async function createChatCompletionFallback(messages: ChatMessage[]): Promise<string> {
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

async function createResponseWithWebSearch(messages: ChatMessage[]): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_WEB_SEARCH_MODEL,
      input: messages,
      tools: [{ type: "web_search_preview" }],
      max_output_tokens: 450,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI web search error: ${getErrorText(data)}`);
  }

  const reply = extractResponseText(data as Record<string, unknown>);
  if (!reply) {
    throw new Error("OpenAI web search returned empty response");
  }

  return reply;
}

export async function createChatCompletion(messages: ChatMessage[]): Promise<string> {
  if (!OPENAI_WEB_SEARCH_ENABLED) {
    return createChatCompletionFallback(messages);
  }

  try {
    return await createResponseWithWebSearch(messages);
  } catch (error) {
    console.error("web search path failed, using fallback chat completion", error);
    return await createChatCompletionFallback(messages);
  }
}
