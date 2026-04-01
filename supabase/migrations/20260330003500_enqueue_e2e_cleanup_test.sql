insert into public.telegram_message_cleanup (
  chat_id,
  message_id,
  due_at,
  state,
  attempts,
  last_error
)
values (
  -1003082478806,
  69359,
  now() + interval '5 minutes',
  'pending',
  0,
  null
)
on conflict (chat_id, message_id)
do update set
  due_at = excluded.due_at,
  state = 'pending',
  deleted_at = null,
  attempts = 0,
  last_error = null;
