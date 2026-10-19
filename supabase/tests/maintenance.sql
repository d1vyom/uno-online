do $test$
begin
  if not exists(select from pg_extension where extname='pg_cron') then
    raise exception 'UNO cleanup is not configured: pg_cron is absent';
  end if;
  if (select count(*) from cron.job where jobname='uno-expiry-cleanup') <> 1
    or not exists(select from cron.job where jobname='uno-expiry-cleanup'
      and active and schedule='*/15 * * * *'
      and command like '%public.uno_prune_expired()%') then
    raise exception 'UNO cleanup must have exactly one active fifteen-minute job';
  end if;
end;
$test$;
