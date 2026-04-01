# Telegram Bot on Supabase Edge Functions

## Что реализовано
- `telegram-webhook`: ответы бота через OpenAI.
- Для ответов включен веб-поиск через OpenAI Responses API (с fallback на обычный completion).
- Контекст диалога хранится в Supabase (`chat_context_messages`) с TTL **2 часа**.
- `daily-question`: отправка daily-вопроса в 11:25 по таймзоне чата.
- Daily-сообщение удаляется через **4 часа**.
- `cleanup-messages`: чистка очереди удаления сообщений.
- `/cleanup`: массовая очистка группы с подтверждением через inline-кнопку.
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

## Команда `/cleanup`
1. В группе отправь `/cleanup`.
2. Бот покажет подтверждение (`Confirm cleanup` / `Cancel`).
3. После подтверждения бот ставит в очередь удаление `message_id` от текущего до `1`.
4. Функция `cleanup-messages` удаляет сообщения батчами (`BATCH_SIZE=200`) и логирует прогресс.

Требования:
- бот должен быть админом группы с правом `Delete messages`.
- команда работает только в `group/supergroup`.

Ограничение Telegram Bot API:
- часть старых сообщений Telegram не даст удалить (в т.ч. из-за лимитов API по давности), такие сообщения помечаются как `not_found/failed` и не блокируют очередь.

Rate limit/flood control:
- при `429` учитывается `retry_after`, сообщение переходит на повтор с соответствующей задержкой.

## ENV (ключевое)
- `OPENAI_API_KEY` — ключ OpenAI.
- `OPENAI_WEB_SEARCH_ENABLED=true` — включить веб-поиск.
- `OPENAI_WEB_SEARCH_MODEL` — модель для веб-поиска (по умолчанию берется `OPENAI_MODEL`).
- `CLEANUP_CONFIRM_TTL_MS` — время жизни подтверждения `/cleanup` (по умолчанию 120000 мс).

## Webhook
```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<PROJECT_REF>.functions.supabase.co/telegram-webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```
