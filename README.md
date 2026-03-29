# Telegram Bot on Supabase Edge Functions

## Что реализовано
- `telegram-webhook`: ответы бота через OpenAI.
- Контекст диалога хранится в Supabase (`chat_context_messages`) с TTL **5 минут**.
- `daily-question`: отправка daily-вопроса в 11:25 по таймзоне чата.
- Daily-сообщение удаляется через **4 часа**.
- `cleanup-messages`: чистка очереди удаления сообщений.
- Список вопросов хранится в БД (`interview_questions`).

## Основные таблицы
- `telegram_chat_settings`
- `chat_context_messages`
- `daily_question_log`
- `daily_question_send_lock`
- `telegram_message_cleanup`
- `interview_questions`

## Где менять вопросы
В БД, таблица `public.interview_questions`.
- добавить вопрос: `insert into public.interview_questions(question) values ('...');`
- выключить вопрос: `update public.interview_questions set is_active = false where id = ...;`

## Деплой
```bash
supabase db push
supabase functions deploy telegram-webhook --no-verify-jwt
supabase functions deploy daily-question --no-verify-jwt
supabase functions deploy cleanup-messages --no-verify-jwt
```

## Webhook
```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<PROJECT_REF>.functions.supabase.co/telegram-webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```
