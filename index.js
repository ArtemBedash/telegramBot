import { Telegraf } from "telegraf";
import OpenAI from "openai";
import dotenv from "dotenv";
import cron from "node-cron";
import express from "express";
import fs from "fs";

dotenv.config();

const BOT_USERNAME = "frontend_guy_bot";
let CHAT_ID = process.env.DAILY_CHAT_ID;
const QUESTIONS_FILE = "./lastQuestionTime.json";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- История сообщений ---
const userChats = {};

// --- Экранирование HTML ---
const escapeHTML = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// --- Форматирование кода из ```
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

// --- Обработка сообщений пользователей ---
bot.on("text", async (ctx) => {
    try {
        const chatId = ctx.chat.id;

        if (!CHAT_ID) {
            CHAT_ID = chatId;
            console.log("chatId для ежедневного вопроса:", CHAT_ID);
        }

        const text = ctx.message.text;
        const chatType = ctx.chat.type;

        if (chatType.includes("group") && !text.includes(`@${BOT_USERNAME}`)) return;

        if (!userChats[chatId]) {
            userChats[chatId] = [
                {
                    role: "system",
                    content:
                        "Ты эксперт по JS, TS и React. Отвечай коротко и лаконично, максимум 5-7 предложений , понятными для собеседования. Не обрезай свой ответ, пиши полностью",
                },
            ];
        }

        userChats[chatId].push({ role: "user", content: text });

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: userChats[chatId],
            max_tokens: 450,
        });

        const reply = response.choices[0].message.content;
        userChats[chatId].push({ role: "assistant", content: reply });

        console.log("История переписки с чатом", chatId, userChats[chatId]);

        const sentMessage = await ctx.reply(formatMessage(reply), { parse_mode: "HTML" });

        setTimeout(async () => {
            try {
                await ctx.deleteMessage(sentMessage.message_id);
                await ctx.deleteMessage(ctx.message.message_id);
                delete userChats[chatId];
                console.log("История переписки с чатом", chatId, "удалена через 24 часа");
            } catch (err) {
                console.error("Ошибка при удалении сообщений:", err);
            }
        }, 8640000);
    } catch (err) {
        console.error(err);
        await ctx.reply("Ошибка 🤖. Попробуй ещё раз.");
    }
});

// --- Запуск бота ---
bot.launch();
console.log("🤖 Бот запущен!");

// --- Вопросы ---
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
    "Как работает сборщик мусора в JavaScript?",
];

// --- Время последнего вопроса ---
let lastQuestionTime = 0;
if (fs.existsSync(QUESTIONS_FILE)) {
    lastQuestionTime = JSON.parse(fs.readFileSync(QUESTIONS_FILE)).lastTime;
}

const ONE_DAY = 24 * 60 * 60 * 1000;

async function sendDailyQuestion() {
    if (!CHAT_ID) return;
    const question = questions[Math.floor(Math.random() * questions.length)];
    const sentDailyMessage = await bot.telegram.sendMessage(CHAT_ID, question);

    // Сохраняем время
    lastQuestionTime = Date.now();
    fs.writeFileSync(QUESTIONS_FILE, JSON.stringify({ lastTime: lastQuestionTime }));

    setTimeout(async () => {
        try {
            await bot.telegram.deleteMessage(CHAT_ID, sentDailyMessage.message_id);
        } catch (err) {
            console.error("Ошибка при удалении ежедневного вопроса:", err);
        }
    }, ONE_DAY);

    console.log("Вопрос дня отправлен:", question);
}

// --- Проверяем пропущенный день при старте ---
if (Date.now() - lastQuestionTime >= ONE_DAY) {
    sendDailyQuestion();
}

// --- Cron на 11:00 ---
cron.schedule("25 11 * * *", sendDailyQuestion);

// --- Мини-сервер для Render ---
const app = express();
app.get("/", (req, res) => res.send("🤖 Bot is running"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));
