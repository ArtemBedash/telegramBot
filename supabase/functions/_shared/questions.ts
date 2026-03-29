import { DEFAULT_QUESTIONS } from "./constants.ts";
import { db } from "./supabase.ts";

export async function getRandomQuestion(): Promise<string> {
  const { data, error } = await db
    .from("interview_questions")
    .select("question")
    .eq("is_active", true)
    .limit(200);

  if (error) {
    console.error("load interview_questions failed:", error.message);
    return DEFAULT_QUESTIONS[Math.floor(Math.random() * DEFAULT_QUESTIONS.length)];
  }

  const pool = (data ?? []).map((x) => x.question).filter((x): x is string => typeof x === "string");
  if (pool.length === 0) {
    return DEFAULT_QUESTIONS[Math.floor(Math.random() * DEFAULT_QUESTIONS.length)];
  }

  return pool[Math.floor(Math.random() * pool.length)];
}
