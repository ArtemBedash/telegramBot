alter table public.telegram_message_cleanup
add column if not exists state text not null default 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'telegram_message_cleanup_state_check'
  ) then
    alter table public.telegram_message_cleanup
      add constraint telegram_message_cleanup_state_check
      check (state in ('pending', 'deleted', 'not_found', 'failed'));
  end if;
end $$;

update public.telegram_message_cleanup
set state = case
  when deleted_at is not null and coalesce(last_error, '') ilike '%message to delete not found%' then 'not_found'
  when deleted_at is not null then 'deleted'
  when attempts > 0 then 'failed'
  else 'pending'
end
where state = 'pending';

-- `not_found` is not the same as successful deletion in Telegram.
update public.telegram_message_cleanup
set deleted_at = null
where state = 'not_found';

create index if not exists idx_telegram_message_cleanup_due_pending
on public.telegram_message_cleanup (due_at)
where deleted_at is null and state = 'pending';
