-- Run as the database owner after the uno_cron migration.
-- A named cron.schedule call updates the existing job rather than duplicating it.
select cron.schedule(
  'uno-expiry-cleanup',
  '*/15 * * * *',
  $job$
    select public.uno_prune_expired();
    delete from cron.job_run_details
      where runid in (
        select history.runid from cron.job_run_details history
          join cron.job jobs on jobs.jobid=history.jobid
        where jobs.jobname='uno-expiry-cleanup'
          and history.start_time<clock_timestamp()-interval '7 days'
        order by history.start_time limit 500
      );
  $job$
);
