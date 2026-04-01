do $cron$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'edge-cleanup-messages';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'edge-cleanup-messages',
    '* * * * *',
    $job$
    select net.http_post(
      url := 'https://niglmpbwsvildsmamxpc.functions.supabase.co/cleanup-messages',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    ) as request_id;
    $job$
  );
end $cron$;
