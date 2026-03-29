# telegrambot

## Что уже реализовано
- Бот полностью переведен на TypeScript (`src/index.ts`).
- Контекст диалога хранится в Supabase в таблице `chat_context_messages`.
- TTL контекста: **4 часа**.
- Ежедневный вопрос отправляется по cron: `25 11 * * *` (`Asia/Jerusalem`).
- Для multi-instance добавлен lock (`daily_question_send_lock`), чтобы вопрос дня не дублировался.

## Обязательные переменные окружения
- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DAILY_CHAT_ID` (опционально)

## Локальный запуск
```bash
npm install
npm run typecheck
npm start
```

## Миграция Supabase
Выполни SQL из файла:
`supabase/migrations/20260329183000_init_telegram_bot.sql`

## Deploy (Render)
`render.yaml` уже настроен:
- build: `npm install`
- start: `npm start`
