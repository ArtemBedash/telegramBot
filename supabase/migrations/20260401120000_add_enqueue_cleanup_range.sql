create or replace function public.enqueue_cleanup_range(
  p_chat_id bigint,
  p_from_message_id integer,
  p_to_message_id integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upper integer := greatest(p_from_message_id, p_to_message_id);
  v_lower integer := least(p_from_message_id, p_to_message_id);
  v_count integer := 0;
begin
  if p_chat_id is null then
    raise exception 'p_chat_id is required';
  end if;

  if v_upper < 1 then
    return 0;
  end if;

  v_lower := greatest(1, v_lower);

  insert into public.telegram_message_cleanup (
    chat_id,
    message_id,
    due_at,
    state,
    deleted_at,
    attempts,
    last_error
  )
  select
    p_chat_id,
    gs,
    now(),
    'pending',
    null,
    0,
    null
  from generate_series(v_lower, v_upper) as gs
  on conflict (chat_id, message_id)
  do update set
    due_at = excluded.due_at,
    state = 'pending',
    deleted_at = null,
    attempts = 0,
    last_error = null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.enqueue_cleanup_range(bigint, integer, integer) to anon;
grant execute on function public.enqueue_cleanup_range(bigint, integer, integer) to authenticated;
grant execute on function public.enqueue_cleanup_range(bigint, integer, integer) to service_role;
