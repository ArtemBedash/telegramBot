alter table public.telegram_chat_settings
add column if not exists profanity_cleanup_enabled boolean not null default false;
