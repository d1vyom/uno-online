-- Supabase provides pg_cron; core storage tests use plain PostgreSQL separately.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
