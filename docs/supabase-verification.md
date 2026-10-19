# Supabase migration verification

Specification and implementation plan dated 2026-10-19; Native execution.
This is the current storage release. Earlier Redis notes are historical.

## Free project and configuration

A dedicated UNO Online project was provisioned in the user-selected
organization at a quoted $0/month. Region: US East, near Vercel's default
function region. No unrelated project was changed, paused, deleted or upgraded.
The user supplied the modern backend secret through the ignored .env.local file.
Secret values were neither printed nor added to Git.

The canonical core migration is 20261019172619_uno_storage.sql. It was initially
generated with the Supabase CLI, then its filename was aligned with the actual
remote migration version reported by the provider. The separate uno_cron
migration only enables the supported platform extension; plain PostgreSQL core
tests do not require that extension.

## TDD and database evidence

- Baseline: the previous 57 core tests passed before migration.
- SQL RED: a PostgreSQL 17 CI service ran 21 cases; 20 failed because the new
  RPCs/tables did not exist. A direct project query independently returned 42883.
- SQL GREEN: the original 21 cases passed in CI after implementation: concurrent room
  creation, one-session uniqueness, last-seat CAS races, rollback, stale writes,
  member removal, numeric codes, expiry, limits, bounded cleanup, locked renewal,
  anonymous denial, backend execution, and migration replay.
- Adapter/configuration RED: 27 failures against the unimplemented adapter and
  old configuration. GREEN: 86 local tests passed after migration, increasing to 92 after final-review regressions.
- Live Supabase: all three dedicated-project integration tests passed, exercising
  independent clients, a competing fifth-seat join, duplicate draw retry, private
  hands, numeric codes and guest-authorized cleanup.

A statement-barrier concurrency regression then reproduced a real deadlock
(SQLSTATE 40P01) between expired-code reservation and cascading cleanup.
The additive 20261019174753_uno_lock_order.sql migration reserves the room key
before locking stale memberships. All 22 SQL tests passed afterward in
PostgreSQL 17 CI (job 118212122055). The repair was then applied to the dedicated
project; tracked migration filenames match its actual migration history.

## Production browser and build evidence

All seven standard production browser tests passed: a complete four-player
round, refresh, chat, rematch, fifth-seat rejection, mobile accessibility,
held heartbeat, hanging snapshot recovery, offline recovery and host transfer.
All seven journeys also passed against the real Supabase project, including a
full round with four isolated guests; the test asserted durable Supabase health and
storageMode, private hands and guest-authorized cleanup.

A clean npm ci, lint, strict types and 92 core tests passed; npm audit reported
zero vulnerabilities. The production build also passed with both Supabase
configuration variables explicitly empty, overriding .env.local.

## Maintenance and permissions

The maintenance SQL check failed before pg_cron was enabled. After installation,
the scheduling script was applied twice and the same check passed: exactly one
active uno-expiry-cleanup job, schedule */15 * * * *, owner postgres.
A real scheduled run succeeded at 2026-10-19 17:45 UTC. After live test cleanup,
there were zero rooms and zero memberships. The job prunes expired app rows in batches of 500 and retains seven days of its
own job history without deleting other jobs' records.

Actual project privilege queries confirm that all six public backend functions
deny EXECUTE to anon/authenticated and permit service_role. Tables are in the
private uno_private schema with RLS enabled and no browser grants/publication.
The security advisor returned only three informational
[RLS-without-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy);
deny-all is intentional because the backend accesses them through protected
definer functions. Do not add permissive browser policies to suppress the notice.

The performance advisor flagged the new rate-limit expiry index as unused
([unused-index notice](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)).
It is retained for bounded expiry scans as the table grows; the newly provisioned
small database has not yet needed an indexed scan.

## Final review

A fresh whole-branch review found no Critical issue and one Important SDK
boundary issue: empty upstream 404/204 responses could be normalized to null,
which looked like an absent room or healthy storage. Six new real-SDK regression
cases failed before the fix. The adapter now requires HTTP 200 for scalar RPCs;
all 92 core tests pass, preserving legitimate HTTP 200 JSON null and false.

One Minor improvement is deferred: if the missing-room browser test's initial
leave request itself fails, that test does not retry guest cleanup in a finally
block. The test targets only its own newly created room, which expires after
24 hours; normal runs left zero rooms and memberships.

Execution rulings: real PostgreSQL 17 CI supplied SQL RED/GREEN because local
Postgres/Docker was unavailable; platform Cron is a separate migration so those
core tests stay portable. Provider-generated migration versions determine the
tracked filenames. No application implementation or approval was delegated;
one fresh reviewer assessed the whole branch.

## Publication and final verification

The reviewed implementation was fast-forwarded into main and pushed under the
existing user authorization. GitHub resolves the commit author to d1vyom.
The merged D:/Projects/uno-online checkout passed a fresh npm ci, lint,
typecheck, 92 core tests, production build and audit (zero vulnerabilities).

On final runtime commit 2b14d39, GitHub CI passed both the 22-case real
PostgreSQL 17 job and the standard seven-browser verification job. All three
live integration tests and all seven live Supabase browser tests passed again
after the SDK status fix; the complete live suite took 4.3 minutes. There were
zero hosted rooms after cleanup. Final production client chunks (14 files)
and tracked files contained neither the actual secret nor a browser SDK leak.

## Verification boundaries

Live Supabase database verification and a Vercel-hosted deployment are different
checks. The configured database is real; the application's hosted URL must still
be exercised before claiming a Vercel-hosted four-player round.
Free-tier quota and inactivity restrictions remain applicable.
