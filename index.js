import { Telegraf } from "telegraf";
import OpenAI from "openai";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

const BOT_USERNAME = "frontend_guy_bot";
let CHAT_ID =  -1003082478806
; // сюда потом подставим chatId, после логирования

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// История сообщений для каждого пользователя
const userChats = {};

// Экранирование HTML
const escapeHTML = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Форматирование кода из ```
const formatMessage = (text) => {
    const parts = text.split(/```/g);
    let result = "";
    parts.forEach((part, i) => {
        const escaped = escapeHTML(part);
        if (i % 2 === 1) result += `<pre>${escaped}</pre>`;
        else result += escaped;
    });
    return result;
};

// Обработка сообщений пользователей
bot.on("text", async (ctx) => {
    try {
        const chatId = ctx.chat.id;

        // Логируем chatId один раз
        if (!CHAT_ID) {
            CHAT_ID = chatId;
            console.log("chatId для ежедневного вопроса:", CHAT_ID);
        }

        const text = ctx.message.text;
        const chatType = ctx.chat.type;

        // В группе отвечаем только если упомянули бота
        if (chatType.includes("group") && !text.includes(`@${BOT_USERNAME}`)) return;

        // Инициализация истории пользователя
        if (!userChats[chatId]) {
            userChats[chatId] = [
                {
                    role: "system",
                    content: "Ты эксперт по программированию на JavaScript, TypeScript и React. Отвечай коротко и лаконично и с короткими примерами кода, понятными для собеседования. И заканчивай мысль , не обрезая ответ, чтобы все уместилось"
                }
            ];
        }

        // Добавляем сообщение пользователя
        userChats[chatId].push({ role: "user", content: text });

        // Отправляем все сообщения GPT
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: userChats[chatId],
            max_tokens: 100
        });

        const reply = response.choices[0].message.content;

        // Добавляем ответ в историю
        userChats[chatId].push({ role: "assistant", content: reply });

        // Отправка пользователю
        await ctx.reply(formatMessage(reply), { parse_mode: "HTML" });

    } catch (err) {
        console.error(err);
        await ctx.reply("Ошибка 🤖. Попробуй ещё раз.");
    }
});

// Запуск бота
bot.launch();
console.log("🤖 Бот запущен!");

// --- Ежедневный вопрос ---
const questions = [
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
    "Как работает сборщик мусора в JavaScript?"
];


// Планируем задавать раз в день в 10:00
cron.schedule("33 14 * * *", async () => {
    if (!CHAT_ID) return; // если chatId ещё не определён

    try {
        const question = questions[Math.floor(Math.random() * questions.length)];
        await bot.telegram.sendMessage(CHAT_ID, question);
        console.log("Вопрос дня отправлен:", question);
    } catch (err) {
        console.error("Ошибка при отправке ежедневного вопроса:", err);
    }
});
