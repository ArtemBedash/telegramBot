-- One-time operational update: shorten existing not-yet-deleted cleanup jobs to 5 minutes from now.
update public.telegram_message_cleanup
set due_at = now() + interval '5 minutes'
where deleted_at is null
  and due_at > now() + interval '5 minutes';
