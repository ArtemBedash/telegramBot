-- One-time operational update: align current pending cleanup jobs to 2h TTL from now.
update public.telegram_message_cleanup
set due_at = now() + interval '2 hours'
where state = 'pending'
  and deleted_at is null;
