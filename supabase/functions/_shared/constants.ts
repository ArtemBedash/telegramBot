// @ts-ignore
export const BOT_USERNAME = Deno.env.get("BOT_USERNAME") ?? "frontend_guy_bot";

export const SYSTEM_PROMPT =
  "Ты дерзкий, остроумный и уверенный эксперт по программированию (JS, TS, React и смежные темы), уровня Senior+. Умеешь развивать тему глубже, объяснять по делу, приводить примеры и разбирать ошибки. Можешь уместно шутить, подстебывать и отшучиваться, но без токсичности и оскорблений. Не зацикливайся только на формате собеседования: отвечай живо, по контексту разговора, и помогай двигаться к практическому результату. Обычно пиши коротко и ясно, но если вопрос сложный - раскрывай его полноценно без обрезания ответа.";

export const CONTEXT_TTL_MS = 12 * 60 * 60 * 1000;
export const DAILY_MESSAGE_DELETE_TTL_MS = 4 * 60 * 60 * 1000;

// @ts-ignore
export const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
// @ts-ignore
export const OPENAI_WEB_SEARCH_ENABLED = (Deno.env.get("OPENAI_WEB_SEARCH_ENABLED") ?? "true") === "true";
// @ts-ignore
export const OPENAI_WEB_SEARCH_MODEL = Deno.env.get("OPENAI_WEB_SEARCH_MODEL") ?? OPENAI_MODEL;
// @ts-ignore
export const APP_TIMEZONE = Deno.env.get("APP_TIMEZONE") ?? "Asia/Jerusalem";

export const DEFAULT_QUESTIONS: string[] = [
  "Какие существуют типы данных в JavaScript и как их объявлять?",
  "Что такое лексическая область видимости в JavaScript?",
  "Какие основные методы массивов существуют в JavaScript?",
  "Что такое объекты в JavaScript? Как работать с их свойствами?",
  "Что такое Map и Set в JavaScript и TypeScript и как их использовать?",
  "Чем отличаются function expression, function declaration, arrow function и IIFE?",
  "Что такое hoisting в JavaScript?",
  "Что такое замыкание (closure) и как оно работает?",
  "Как работает this в JavaScript?",
  "Как использовать Call, Bind и Apply?",
  "Что такое классы в JavaScript и как работают статические методы?",
  "Что такое Promise и как использовать async/await?",
  "Что такое Event Loop в JavaScript?",
  "Что такое очередь задач и микротаски?",
  "Какие способы выполнения асинхронного кода существуют?",
  "Что такое proto / prototype и как работает прототипное наследование?",
  "Как происходит приведение типов данных в JavaScript?",
  "Что такое каррирование и как его использовать?",
  "В чем разница между модулями и стандартным экспортом/импортом (ESM)?",
  "Что такое полифиллы и когда их используют?",
  "Что такое итераторы и как сделать объект итерируемым?",
  "Как написать полифил для forEach?",
  "Как работает сборщик мусора в JavaScript?",
];
