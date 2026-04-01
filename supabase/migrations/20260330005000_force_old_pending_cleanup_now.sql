-- One-time operation: force old pending queue items to be due now.
update public.telegram_message_cleanup
set due_at = now()
where state = 'pending'
  and deleted_at is null
  and created_at < now() - interval '5 minutes';
