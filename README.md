# Telegram Bot on Supabase Edge Functions

Проект полностью переведен на Supabase Edge Functions (без Render и без постоянного Node-процесса).

## Что реализовано
- `telegram-webhook`: обработка входящих сообщений Telegram + ответ через OpenAI.
- Контекст диалога хранится в Supabase, TTL контекста: **4 часа**.
- `daily-question`: отправка вопроса дня с антидублем для multi-instance (`daily_question_send_lock`).
- `cleanup-messages`: удаление сообщений из Telegram по очереди удаления.

## Edge функции
- `supabase/functions/telegram-webhook/index.ts`
- `supabase/functions/daily-question/index.ts`
- `supabase/functions/cleanup-messages/index.ts`

## Миграции
- `supabase/migrations/20260329183000_init_telegram_bot.sql`
- `supabase/migrations/20260329221500_add_telegram_message_cleanup.sql`

## Нужные secrets в Supabase
- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_WEBHOOK_SECRET` (рекомендуется)
- `CRON_SECRET` (рекомендуется)
- `DAILY_CHAT_ID` (опционально)
- `BOT_USERNAME` (опционально, по умолчанию `frontend_guy_bot`)
- `OPENAI_MODEL` (опционально, по умолчанию `gpt-4o-mini`)
- `APP_TIMEZONE` (опционально, по умолчанию `Asia/Jerusalem`)

## Деплой
```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
supabase secrets set TELEGRAM_BOT_TOKEN=... OPENAI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TELEGRAM_WEBHOOK_SECRET=... CRON_SECRET=...
supabase functions deploy telegram-webhook --no-verify-jwt
supabase functions deploy daily-question --no-verify-jwt
supabase functions deploy cleanup-messages --no-verify-jwt
```

## Установить webhook Telegram
```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<PROJECT_REF>.functions.supabase.co/telegram-webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

## Расписания (Supabase Schedules)
- `daily-question`: `25 11 * * *` (timezone `Asia/Jerusalem`)
- `cleanup-messages`: `*/15 * * * *`

Для расписаний добавь HTTP header:
- `x-cron-secret: <CRON_SECRET>`
