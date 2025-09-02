import { Telegraf } from "telegraf";
import OpenAI from "openai";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

const BOT_USERNAME = "frontend_guy_bot";
let CHAT_ID = process.env.DAILY_CHAT_ID;

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

        // Логируем chatId для ежедневного вопроса
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
                    content: "Ты эксперт по JS, TS и React. Отвечай коротко и лаконично, максимум 5-7 предложений , понятными для собеседования. Не обрезай свой ответ, пиши полностью"
                }
            ];
        }

        // Добавляем сообщение пользователя
        userChats[chatId].push({ role: "user", content: text });

        // Отправляем все сообщения GPT
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: userChats[chatId],
            max_tokens: 450
        });

        const reply = response.choices[0].message.content;
        userChats[chatId].push({ role: "assistant", content: reply });

        // Логируем историю переписки
        console.log("История переписки с чатом", chatId, userChats[chatId]);

        // Отправка сообщения
        const sentMessage = await ctx.reply(formatMessage(reply), { parse_mode: "HTML" });

        // Удаление через сутки (24 часа)
        setTimeout(async () => {
            try {
                await ctx.deleteMessage(sentMessage.message_id);
                await ctx.deleteMessage(ctx.message.message_id);

                // Удаляем переписку из памяти
                delete userChats[chatId];
                console.log("История переписки с чатом", chatId, "удалена через 24 часа");
            } catch (err) {
                console.error("Ошибка при удалении сообщений:", err);
            }
        }, 8640000); // 24 часа

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

// Планируем задавать раз в день в 11:00
cron.schedule("0 11 * * *", async () => {
    if (!CHAT_ID) return; // если chatId ещё не определён

    try {
        const question = questions[Math.floor(Math.random() * questions.length)];
        const sentDailyMessage = await bot.telegram.sendMessage(CHAT_ID, question);

        // Удаление ежедневного вопроса через сутки
        setTimeout(async () => {
            try {
                await bot.telegram.deleteMessage(CHAT_ID, sentDailyMessage.message_id);
            } catch (err) {
                console.error("Ошибка при удалении ежедневного вопроса:", err);
            }
        }, 8640000);

        console.log("Вопрос дня отправлен:", question);
    } catch (err) {
        console.error("Ошибка при отправке ежедневного вопроса:", err);
    }
});
