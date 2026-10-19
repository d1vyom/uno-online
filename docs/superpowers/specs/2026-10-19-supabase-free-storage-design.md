# Supabase Free storage migration

Date: 2026-10-19
Status: Approved by the user on 2026-10-19; detailed implementation planning follows.
Execution preference: Native execution in the current chat, retained from the user's earlier selection.

## Intent and boundaries

The user approved replacing Upstash with Supabase to use free services for the
existing four-player game. Keep the Next.js, React, and Tailwind interface, pure
rules engine, guest cookies, room lifecycle, chat, sounds, rematches, and private
snapshot contract. Replace the production storage adapter and its deployment
configuration. Continue to prohibit process-local room storage on Vercel.

The direct Supabase migration request supersedes the repository's Redis-only
wording. During implementation update AGENTS.md to require shared durable
Supabase/Postgres storage instead. Preserve the Superpowers workflow and the
generated Next.js guidance. Existing GitHub main-push authorization continues;
publish verified migration commits under the existing author identity.

The connected account currently has no UNO Online project. Use a dedicated free
project for this app, subject to the account's available free-project allowance.
Do not apply this schema to another application's database, change its plan, or
pause/delete another project to make space. If free provisioning is unavailable,
finish the local migration and provide the exact missing setup step.

Free means operating within provider quotas, not unlimited use or guaranteed
uptime. Supabase Free can pause after a week of inactivity. Vercel Hobby is for
personal, non-commercial use. Do not enable paid plans or add-ons automatically.

## Current implementation

RoomStore already isolates storage behind read, create, commit, activeRoom, and
consumeLimit. The room service owns game rules, identity-derived actors, bounded
action IDs, six-attempt CAS retries, presence deadlines, private projections,
and a separate action revision for game/membership changes.

The Redis adapter currently implements atomic room/membership writes and rate
limits using Lua. Production setup requires UPSTASH_REDIS_REST_URL and
UPSTASH_REDIS_REST_TOKEN. The health endpoint treats only redis mode as durable.
Replace these integration points rather than duplicating game logic in SQL.

The previous release passed 57 core tests and seven production browser tests.
Two live Redis tests were conditional on credentials. These are the migration's
regression baseline, not claims of Supabase verification.

## Selected approach and alternatives

**Selected:** Next.js routes call server-only Supabase Postgres RPC functions.
Those functions implement the existing RoomStore semantics transactionally.
Retain approximately one-second visible-room polling and ten-second heartbeats.
This preserves the existing authentication and privacy model and uses no paid
feature or additional realtime service.

**Alternative: Supabase Realtime now.** This would require a separate channel
authorization design for opaque guest cookies. Broadcasting a row containing
room JSON would expose hands and deck order. Introducing Supabase Auth just to
subscribe would enlarge this migration. Realtime is deferred deliberately.

**Alternative: direct pooled Postgres connection.** It can support transactions,
but adds connection-string/pool configuration. The HTTPS Data API fits Vercel's
existing stateless route handlers and supports the same atomic functions.

## Database layout

Create an app-specific private schema, uno_private, with three tables:

- rooms: code primary key, revision, state JSONB, and expires_at. Room JSON keeps
  the existing serializable rules/state representation. Index expires_at.
- memberships: session_hash primary key and room_code foreign key referencing
  rooms with ON DELETE CASCADE. A session can occupy at most one active room.
  Index room_code for membership removal and checks.
- rate_limits: hashed key primary key, request count, and reset_at. Index reset_at.

Enable RLS on the tables. Revoke table/schema access from PUBLIC, anon, and
authenticated. Do not add the private schema or the room tables to browser
Data API access or the Realtime publication. No browser receives raw room rows.

Expose narrowly scoped public RPC functions for the backend only. Revoke their
default PUBLIC execution privilege; grant EXECUTE only to service_role. Use
SECURITY DEFINER with search_path = '' and fully qualified references. The
browser keeps using the application's authenticated Next.js endpoints.

## Atomic RPC contracts

- uno_room_read(p_code text) -> jsonb or null: return only unexpired room state.
  This raw state is available only to the server; existing projectRoom performs
  the player-specific projection before any response leaves Next.js.
- uno_room_create(p_room jsonb, p_session_hash text) -> boolean: reserve the room
  code and session membership in one transaction. Code collisions or an existing
  active membership return false with no orphan room or partially written index.
- uno_room_commit(p_expected_revision bigint, p_room jsonb,
  p_added_session_hash text default null) -> boolean: lock the existing room,
  require its expected revision, validate the proposed membership set, update
  membership and state together, and refresh the 24-hour inactivity deadline.
  An empty proposed player list deletes the room and its membership rows.
- uno_active_room(p_session_hash text) -> text or null: return a valid unexpired
  membership as text, including numeric-only codes; discard orphan/expired
  membership records safely.
- uno_take_rate_limit(p_key text, p_maximum integer,
  p_window_seconds integer) -> boolean: atomic fixed-window increment/reset
  using Postgres UPSERT and the database clock. Reject invalid limits/windows.
- uno_prune_expired() -> cleanup summary: remove expired rooms, their cascading
  memberships, and expired rate-limit rows. Restrict execution to the backend
  role and the database owner used by the scheduled maintenance job.

Use row locks, uniqueness, and transactional rollback to protect competing
fourth/fifth joins and simultaneous attempts to occupy different rooms with the
same session. A failed CAS returns false, not success with a lost update.
Avoid a global database lock. Establish a consistent locking order and test
that conflicts leave room state and memberships unchanged.

Request authentication, expected gameplay revision checks, idempotency records,
host authorization, and private hand selection remain in the tested room service.
The RPC role is an internal server capability, not a player identity.

## Expiration and free-tier resource use

Read methods enforce expiration immediately, independently of scheduled cleanup.
Configure one lightweight Supabase Cron job to prune expired app records every
15 minutes. Use a fixed job name and idempotent scheduling so reapplying setup
does not create duplicate jobs. Bound cleanup batches and keep maintenance
history from growing indefinitely. A concurrent valid room update must not be
deleted by cleanup based on an outdated expiration value.

Rate counters reuse one key per logical limiter and reset its window in place;
do not create a new row for every request or timestamp window. Preserve bounded
chat, events, and accepted-action records. Do not add artificial keep-alive calls
to prevent Supabase's free-project inactivity policy.

## Application changes

Add createSupabaseStore in src/lib/server/supabase-store.ts, implementing the
current RoomStore interface through the verified supabase-js RPC API. Check RPC
errors and fail closed with an actionable 503. Handle text, boolean, null, and
JSONB return types explicitly. Do not treat an RPC error as a missing room or
fall back to memory storage when a production database is unavailable.

Change durable mode from redis to supabase in the stored/public types and the
health endpoint. A healthy deployment reports storage: supabase and durable:
true. Explicit local memory mode remains available outside Vercel and continues
to display its development notice.

Use server-only SUPABASE_URL and SUPABASE_SECRET_KEY variables with a modern
Supabase secret key. Disable client-side session persistence/refresh on this
administrative SDK client. Never use NEXT_PUBLIC_ for the secret, commit it,
return it in errors, or include it in browser bundles. No Supabase browser SDK,
publishable key, or end-user Supabase Auth account is required for this design.

Remove @upstash/redis, redis-store.ts, Redis-specific conditional tests/scripts,
and current Upstash setup requirements. Add Supabase adapter and SQL tests, safe
environment examples, setup instructions, and the new storage test command.
Keep historical release/design notes labeled as history; add current Supabase
verification notes so users do not follow obsolete deployment instructions.

## Implementation sequence

1. Review this specification, then write the detailed implementation plan using
   the retained Native execution method.
2. Establish failing RoomStore/RPC/SQL tests for privacy and atomic behavior.
3. Generate a migration using the Supabase CLI's migration command; implement
   private tables, protected RPCs, expiration, and maintenance setup.
4. Implement the Supabase adapter, update storage selection and health, remove
   Upstash, and bring adapter/service tests to green.
5. Apply and verify against the dedicated free project when available; run
   security/performance advisors and confirm actual role permissions.
6. Run the full regression suite and four-player production browser journey,
   update setup/verification documents, review, and push verified commits to main.

## Acceptance and verification

- Real SQL tests exercise transaction rollback, single-session uniqueness,
  competing last-seat joins, CAS conflicts, and no orphan memberships.
- Retry a committed draw with the same action ID; its hand grows exactly once.
- Expired reads return null; membership cleanup and a 24-hour activity refresh
  agree. Cleanup does not delete a room concurrently kept active.
- Rate-limit counters are atomic and reset correctly across window boundaries.
- Anonymous/authenticated database roles cannot read private tables or execute
  the backend RPCs. No opponent hand or deck order reaches any browser response.
- Adapter tests cover RPC errors, malformed results, numeric room codes, missing
  configuration, and rejection of memory mode on Vercel.
- Existing rules, guest-cookie contracts, readiness races, reconnect deadlines,
  held-heartbeat actions, hung-snapshot recovery, winner display, and rematches
  continue to pass.
- Lint, strict types, unit/SQL/integration tests, dependency audit, production
  build, and the production browser suite pass. CI runs the reproducible SQL
  tests and clearly distinguishes them from conditional hosted integration tests.
- The app builds without Supabase credentials; configured health and an actual
  four-player hosted round are required before claiming hosted verification.
- If the dedicated database cannot be provisioned for free, do not upgrade or
  silently use another app's database. Deliver tested local code and migrations
  with a precise statement of what external verification remains.

## Official references checked

- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- https://supabase.com/docs/guides/cron
- https://supabase.com/pricing
- https://vercel.com/docs/plans/hobby

The October 12 TLS cipher deprecation notice was reviewed. The app's Node.js 24
HTTPS client uses modern TLS; no legacy TLS compatibility work is planned.
