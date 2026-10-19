# Supabase Free Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan natively, task by task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace Upstash with Supabase Free while preserving the existing four-player game, guest privacy, and Vercel deployability.

**Architecture:** The existing room service and rules engine remain authoritative. A Supabase adapter implements RoomStore through protected Postgres RPC functions, with atomic room/membership transactions and database-backed rate limits. Keep current private HTTP snapshots and polling; add no browser database access or Supabase Auth dependency.

**Tech Stack:** Existing Next.js/React/Tailwind/TypeScript and Node.js 24; pinned supabase-js; PostgreSQL 17; pg as a development-only SQL test client; Vitest and Playwright; Supabase CLI for migration naming and configuration.

**Spec:** [Approved Supabase design](../specs/2026-10-19-supabase-free-storage-design.md).

**Execution method:** Native, approved by the user. Implementation and verification completed; code integrated and pushed to main. The unavailable-credentials fallback was not needed because the dedicated free project and secret were configured.

## Global Constraints

- Continue to prohibit process-local room storage on Vercel.
- Keep the Next.js, React, and Tailwind interface, pure rules engine, guest cookies, room lifecycle, chat, sounds, rematches, and private snapshot contract.
- Do not apply this schema to another application's database, change its plan, or pause/delete another project to make space.
- Do not enable paid plans or add-ons automatically.
- Retain approximately one-second visible-room polling and ten-second heartbeats.
- Enable RLS on the tables. Revoke table/schema access from PUBLIC, anon, and authenticated.
- No browser receives raw room rows.
- Use SECURITY DEFINER with search_path = '' and fully qualified references.
- A failed CAS returns false, not success with a lost update.
- Do not add artificial keep-alive calls to prevent Supabase's free-project inactivity policy.
- Use server-only SUPABASE_URL and SUPABASE_SECRET_KEY variables with a modern Supabase secret key.
- No Supabase browser SDK, publishable key, or end-user Supabase Auth account is required for this design.
- The app builds without Supabase credentials; configured health and an actual four-player hosted round are required before claiming hosted verification.
- Preserve the existing author identity and prior authorization to push verified commits to main. Never force-push main.

## Review Focus

1. Creating two rooms simultaneously for one session must leave exactly one room and one membership, never an orphan row. Task 1 pins it.
2. Cleanup must not delete a room whose expiration was renewed concurrently. Task 1 pins a locked-row cleanup race.
3. Database functions otherwise executable by PUBLIC must remain inaccessible to anon/authenticated callers after migration reapplication. Tasks 1 and 3 pin privileges and replay safety.
4. SDK/RPC errors or malformed scalar results must produce service-unavailable behavior, not room-not-found or a false successful write. Task 2 pins these boundaries.
5. Browser tests against a real backend must clean up only their own rooms and must not accidentally target another project's data. Task 4 pins explicit mode selection and guest-authorized cleanup.

## File and interface map

- `supabase/config.toml`: CLI-generated local project configuration; no credentials.
- `supabase/migrations/`: one core migration, generated with the CLI as `uno_storage`. Record its exact printed path in the execution ledger; do not invent its timestamp. SQL tests load that generated migration as their source of truth.
- `supabase/maintenance.sql`: idempotent scheduling for the app's one 15-minute cleanup job after pg_cron is enabled. It is separate from core schema installation so generic PostgreSQL tests need no pg_cron extension.
- `src/lib/server/supabase-store.ts`: `createSupabaseStore(client: SupabaseClient): RoomStore`, using the RPC contracts below. Runtime result validation stays here.
- `src/lib/server/store.ts`: choose shared Supabase storage by default; retain explicit local memory mode; never fall back on a production error.
- `src/lib/server/types.ts`: replace durable mode `redis` with `supabase` in Room and RoomStore. Preserve all other domain interfaces.
- `src/app/api/health/route.ts`: report durable true for Supabase and false for memory; test actual database connectivity through the adapter.
- `tests/sql/setup.ts`, `tests/sql/storage.test.ts`: real PostgreSQL migration/permission/transaction tests with multiple connections. Require TEST_DATABASE_URL to a disposable database named uno_test; reject other database names before schema mutation.
- `tests/server/supabase-store.test.ts`, `tests/server/storage-config.test.ts`: real SDK with controlled HTTP responses for protocol/configuration contracts; do not substitute these for SQL tests.
- `tests/server/supabase-integration.test.ts`: conditional live RPC integration against the dedicated UNO project, using unique test-owned room codes/sessions and guest-authorized cleanup.
- `e2e/helpers/cleanup.ts`: leave test-owned rooms through the authenticated app API; never truncate hosted tables.
- `.github/workflows/ci.yml`: PostgreSQL 17 service with disposable uno_test database; install/app checks plus mandatory SQL tests and existing production browser tests.
- `.env.example`, `README.md`, `AGENTS.md`, `docs/supabase-verification.md`: current setup, constraints, evidence, and free-tier limitations. Preserve old release documents as historical records.
- `package.json`, `package-lock.json`, `vitest.config.ts`, `playwright.config.ts`: dependencies, SQL/live-test commands, and an explicit Supabase browser-test mode.
- Remove `src/lib/server/redis-store.ts`, `tests/server/redis-contract.test.ts`, `tests/server/redis-store.test.ts`, @upstash/redis, and test:redis after replacement is verified.

### RPC signatures consumed by the adapter

| RoomStore method | Database function | Successful result |
| --- | --- | --- |
| read(code) | public.uno_room_read(p_code text) | Room JSONB or null |
| create(room, sessionHash) | public.uno_room_create(p_room jsonb, p_session_hash text) | boolean |
| commit(previousRevision, room, membershipChange?) | public.uno_room_commit(p_expected_revision bigint, p_room jsonb, p_added_session_hash text default null) | boolean |
| activeRoom(sessionHash) | public.uno_active_room(p_session_hash text) | text or null |
| consumeLimit(key, maximum, windowSeconds) | public.uno_take_rate_limit(p_key text, p_maximum integer, p_window_seconds integer) | boolean |
| Scheduled maintenance | public.uno_prune_expired() | JSONB counts for rooms and rate-limit rows |

The SQL commit function derives removals from the old and proposed player sets. The adapter passes membershipChange.add; it does not issue separate membership writes. Snapshot privacy remains in projectRoom.

## Task 1: Implement protected transactional storage with real SQL tests

**Files:** CLI configuration/core migration; `tests/sql/setup.ts`, `tests/sql/storage.test.ts`; package/test configuration and PostgreSQL CI service.

**Interfaces:** Produce the six RPC functions above and private rooms, memberships, and rate_limits tables. Other tasks consume their exact names, arguments and result types.

- [x] Establish an isolated worktree and codex/supabase-free-storage branch using the worktree skill; record the plan-scoped ledger and baseline checks.
- [x] Discover Supabase CLI commands with --help, initialize local configuration, and generate the empty uno_storage migration. Add pinned pg and its types for tests; no production SQL connection dependency is introduced.
- [x] Implement the SQL test harness: connect only to an explicitly configured uno_test database; bootstrap Supabase role names only in that disposable database; apply the tracked migration; use independent connections for races; close every pool/client in finally hooks.
- [x] Add the PostgreSQL 17 CI service with POSTGRES_DB=uno_test and a health check, and expose TEST_DATABASE_URL only to SQL tests. If local Docker/Postgres is unavailable, use this feature-branch CI service to observe SQL RED/GREEN; do not claim memory tests prove SQL correctness.
- [x] Write `creates one room for one session atomically`: concurrent create calls with different room codes and the same session must produce exactly one true result, one room, and one membership. Run `npm run test:sql`; verify RED because the empty migration has not created the RPC, then implement private tables, indexes, RLS and creation logic to GREEN.
- [x] Add RED cases for code collisions, expired reads, numeric-only active codes, and room deletion cascading memberships. Implement read/active-room behavior and verify GREEN.
- [x] Add RED cases for competing same-revision updates and last-seat proposals: exactly one commit succeeds, the winning revision/state is retained, at most four players exist, and the losing write leaves no membership behind. Implement row-locked CAS and transaction rollback; verify GREEN.
- [x] Add RED cases for two rooms racing to add one session, mismatched added-session arguments, duplicate session membership in proposed state, stale revisions, and deleting an empty room. Use deterministic locking/uniqueness guarantees; verify GREEN without a global lock.
- [x] Add RED expiration/rate tests: refreshed activity extends the deadline by 24 hours, expired data is inaccessible immediately, fixed-window counters permit exactly the configured maximum, and invalid window/limit inputs are rejected. Implement UPSERT-based limits and verify GREEN.
- [x] Add RED cleanup tests: expired rooms/memberships and rate rows are deleted in batches of at most 500; active rooms survive; a locked expired row being renewed is skipped and survives after renewal. Implement bounded cleanup with consistent locks and verify GREEN.
- [x] Add RED security tests: anon/authenticated cannot select private tables or execute any backend RPC; service_role can execute the intended functions; every definer has an empty search_path; a second application of the migration preserves data and does not restore public privileges. Implement explicit revokes/grants and verify GREEN.
- [x] Run the complete real SQL suite, record the actual RED/GREEN results and CI/local source of execution, then commit `feat: add protected transactional Supabase storage`.

## Task 2: Replace the production adapter and prove its HTTP contracts

**Files:** new Supabase adapter, store selection, domain mode types, health endpoint, adapter/configuration tests, safe environment example, package/lockfile; remove obsolete Redis files/tests.

**Interfaces:** Consume Task 1 RPCs. Produce a RoomStore with mode=supabase; the room service consumes the same methods and booleans as before. The Supabase administrative client uses persistSession=false, autoRefreshToken=false and detectSessionInUrl=false.

- [x] Install a current pinned supabase-js version after checking current documentation/changelog. Write `returns a numeric-only membership code as text`, `read distinguishes null from an RPC error`, and `boolean writes reject malformed responses`. Exercise the actual SDK against complete controlled REST responses; run `npm test -- tests/server/supabase-store.test.ts` to RED.
- [x] Implement createSupabaseStore(client: SupabaseClient): RoomStore with exact named RPC arguments and server-side result guards. Missing/null/malformed write results and all RPC/network errors become ServiceError status 503; a legitimate false result remains a CAS/uniqueness conflict. Verify GREEN.
- [x] Add RED read-result cases for wrong schema version, invalid code/revision/player structure, and a returned room that does not match the requested code. Validate the stored room boundary without weakening existing player-specific projection.
- [x] Add RED configuration/health cases: missing URL/secret gives actionable 503; memory is rejected whenever VERCEL is set; a healthy Supabase connection reports storage=supabase/durable=true; local memory remains durable=false; database failure never selects memory.
- [x] Update store selection, mode types and health to GREEN. Use SUPABASE_URL and SUPABASE_SECRET_KEY only on the server; no NEXT_PUBLIC_ secret or client database integration.
- [x] Remove Upstash packages, adapter, conditional Redis suites and test:redis. Add test:sql and test:supabase commands. Keep SQL tests explicit/mandatory in CI and live RPC tests conditional on actual credentials.
- [x] Run lint, strict types, all core/SQL tests and build; ensure the build succeeds with Supabase variables absent. Commit `feat: migrate multiplayer persistence to Supabase`.

## Task 3: Configure free-project maintenance and verify hosted storage

**Files:** `supabase/maintenance.sql`, `tests/server/supabase-integration.test.ts`, current setup/environment instructions, `docs/supabase-verification.md`.

**Interfaces:** Consume Tasks 1–2. Configure exactly one job named uno-expiry-cleanup, schedule `*/15 * * * *`, calling public.uno_prune_expired(). Do not change another application's schema or jobs.

- [x] Inspect the connected account/organization and current free-project allowance. Create a dedicated UNO Online project only if the operation is confirmed free; otherwise record the external prerequisite and continue local work. Never pause/delete unrelated projects or choose a paid plan.
- [x] Apply the reviewed core migration to the dedicated project. Retrieve/configure the project's modern backend secret only through approved project tooling or the user's local configuration; never print it or commit it. Run a test read and verify the health endpoint against that database.
- [x] Enable supported pg_cron and implement the maintenance script. Reapply it and query cron.job: exactly one active uno-expiry-cleanup job must exist. Limit retained history for this job to seven days without deleting other jobs' records; use the same maintenance SQL snippet for app cleanup and its own history pruning.
- [x] Write live integration tests with unique test-owned codes/session hashes: independent adapters share state; competing fourth/fifth joins leave four seats; concurrent CAS commits do not lose state; the same draw action ID draws once; a leave frees membership; numeric room codes rejoin correctly. Run against the dedicated database and clean only owned rooms in finally hooks.
- [x] Verify actual anonymous/authenticated RPC denial and schema privacy; run Supabase security/performance advisors and resolve migration-introduced findings. Record provider-level limitations separately from application defects.
- [x] Confirm cleanup can be invoked and reports bounded counts; verify scheduling configuration and actual role grants. Do not describe scheduled execution as observed unless a job-run record confirms it.
- [x] If provisioning/credentials are unavailable, retain explicitly conditional live tests and precise setup instructions. Do not substitute another project or report hosted tests as passed. Commit `docs: configure Supabase Free deployment and maintenance` with the associated integration coverage.

## Task 4: Verify four-player play and publish the completed migration

**Files:** Playwright configuration, test-owned room cleanup helper, relevant E2E suites, README/AGENTS/verification notes, CI.

**Interfaces:** Existing browser journeys remain unchanged in their user-facing assertions. An explicit UNO_E2E_STORE=supabase opt-in selects the real backend; default CI browser mode remains the existing local memory adapter. Hosted test credentials are server-only.

- [x] Add acceptance coverage for explicit storage-mode selection and cleanup of only the test's known rooms through their guest cookies. Do not introduce seed/debug endpoints or production-accessible cleanup RPCs for tests.
- [x] Run the existing production browser suite against the migrated app: four private hands, readiness, full game, chat, refresh, rematch, fifth-seat rejection, mobile/a11y, offline recovery, held-heartbeat actions, hung snapshots, and host transfer must remain GREEN.
- [x] When the dedicated Supabase project is available, run the same production browser flow with UNO_E2E_STORE=supabase. Verify the backend reports durable storage and a second adapter/process reads the same room. Exercise leave cleanup in finally hooks, including failing-test paths.
- [x] Update README and .env.example to current Supabase setup, one-time SQL/maintenance installation, free-tier inactivity/quotas, Node.js 24 and Vercel settings. Update AGENTS.md's Redis-only line to shared Supabase/Postgres. Preserve historical release documents and clearly point to current Supabase verification.
- [x] Run a clean npm ci, lint, typecheck, all core tests, mandatory real SQL tests, conditional live RPC tests when configured, production build, audit and production browser suite. Inspect the client bundle for accidental SDK/secret inclusion and inspect current health/error responses.
- [x] Use verification-before-completion and requesting-code-review skills for one fresh final whole-branch review. Reproduce material findings as failing regressions, fix them natively, and rerun affected checks plus the full project suite.
- [x] Commit, integrate into main using the existing authorization, push without force, verify the remote SHA/author and CI results, and archive the temporary managed worktree after preserving needed artifacts.
- [x] Report the Supabase migration, actual local/CI/live results, free-project configuration status, and any remaining external deployment step. Claim a Vercel-hosted round only if exercised on a real deployment URL.

## Plan self-review

- Specification coverage: atomic storage/privacy/expiration/limits in Task 1; server-only adapter and removal in Task 2; dedicated free project/Cron/live verification in Task 3; UI regression, documentation, review and publication in Task 4.
- Review Focus coverage: two-room/session races, cleanup races and default privileges in Tasks 1/3; malformed RPC results in Task 2; real-backend test isolation in Task 4.
- Interfaces remain aligned with RoomStore; no game rules or guest authentication are reimplemented in SQL.
- The SQL test database guard and dedicated-project boundary prevent destructive tests against unrelated applications. Conditional provider verification is distinguished from reproducible PostgreSQL CI tests.
- Implementation starts only after the user reviews this written plan; Native execution remains selected.
