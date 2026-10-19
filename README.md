# UNO Online

**Good friends. Great rivalries.** A private card table for two to four people,
built with Next.js App Router, React, TypeScript, and Tailwind CSS.

Create a room, send your friends the link, and ready up. Play a complete round,
refresh without losing your seat, chat at the table, and come back for a rematch.
No accounts or downloads required.

[Play online](https://uno-online-three.vercel.app).

## Run locally

Use Node.js 24. The Vercel project, CI, and development container use that version.

```powershell
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
Add-Content .env.local 'UNO_STORE=memory'
npm run dev
```

Open [localhost:3000](http://localhost:3000). Use separate browser profiles,
incognito windows, or devices for different players. Tabs in the same profile
share the guest cookie and therefore the same seat.

Memory mode is explicitly for local development: rooms disappear when the process
restarts. Its notice is visible in the lobby and game. For durable local games,
configure Supabase as below and remove `UNO_STORE=memory`.

## Deploy to Vercel

The frontend and backend deploy together as one Next.js project. There is no
separate Express server, Socket.IO host, Codespace URL, or localhost backend URL.

1. Create a **Free** project in [Supabase](https://supabase.com/dashboard).
   Pick a region close to your Vercel Functions region. The configured UNO project
   uses US East, near Vercel's default function region. Do not upgrade the plan
   unless you explicitly want paid resources.
2. Install all tracked SQL migrations from `supabase/migrations/` in timestamp
   order using the Supabase SQL editor, or use the Supabase CLI's database
   migration workflow. This includes the core schema, Cron extension and
   room-reservation lock-order repair.
   Run `supabase/maintenance.sql` once afterward. Reapplying the setup preserves
   rooms and updates the named cleanup job instead of creating duplicates.
   Tables live in a private schema; the backend RPCs are granted only to
   service_role. Do not grant anonymous access to make setup errors disappear.
3. Copy the project's URL and **secret API key** (`sb_secret_…`) from its settings.
   In Vercel project settings, add these server-only environment variables:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | `https://your-project-ref.supabase.co` |
   | `SUPABASE_SECRET_KEY` | The backend-only `sb_secret_…` key |

   Keep `UNO_STORE` unset. Never prefix the secret with `NEXT_PUBLIC_`, put it
   in browser code, or commit it. A publishable/anon key cannot call these RPCs.
   Vercel rejects development memory mode even if `UNO_STORE=memory` is set.
4. Import [d1vyom/uno-online](https://github.com/d1vyom/uno-online) into Vercel.
   Select **Next.js**, use the repository root as the Root Directory, keep
   `npm ci` for installation and `npm run build` for the build, and leave Output
   Directory at its Next.js default. If updating an older Vite project, clear its
   old `dist` output override and `frontend` root override.
5. Deploy or redeploy after adding the environment variables. A build does not
   need live Supabase credentials; playing a hosted game does.
6. Open `/api/health`. A correctly configured deployment returns
   `{"status":"ok","storage":"supabase","durable":true}`.
   Missing/unreachable storage returns HTTP 503 instead of creating unreliable
   in-memory rooms.
7. Create a room on the deployed URL, join from three other browser profiles or
   devices, ready all four players, and start. Refresh one device, play cards,
   exchange chat, finish, and rematch. This is the hosted verification step.

All moves use authenticated HTTP requests. Other visible players receive updated
snapshots about once per second. This turn-based transport needs no long-running
WebSocket server; Postgres transactions coordinate rooms across Vercel instances.
There is no Upstash dependency or Supabase client access to private room rows.

Use **Supabase Free + Vercel Hobby** for personal, non-commercial games within
their quotas. Supabase Free includes 500 MB of database storage and 5 GB of egress
and can pause after a week of inactivity. Polling and database traffic consume
usage, so free does not mean unlimited traffic or guaranteed always-on service.
See [Supabase pricing](https://supabase.com/pricing) and
[Vercel Hobby limits](https://vercel.com/docs/plans/hobby).

## At your table

- Six-character private room codes and shareable invite links.
- Two to four named guests, shared readiness, and host-only start.
- A 108-card deck with seven-card hands and a numeric opening discard.
- Legal-card hints, hand sorting, wild-color selection, draw/pass, and UNO.
- Hidden opponent hands, room chat, recent actions, and optional sound/volume.
- Short disconnect recovery, host transfer, forfeit handling, and room win counts.
- Rematches at the same table.
- Keyboard-accessible cards and dialogs, reduced motion, and responsive layouts.

## Rules and house rules

Match the active color or the last card's number/action. A wild changes color.
Skip bypasses the next player; Reverse changes direction and acts as a skip with
two players. Draw Two and Wild Draw Four make the next player draw and skip them.
Play Wild Draw Four only when holding no card of the active color.

Draw one card. If it is playable, play **that drawn card** or pass. If it is not
playable, the turn advances automatically. You cannot draw twice in the same turn.

At two cards, call UNO before playing or enable “Declare UNO with my next card.”
**House rule:** leaving one card without declaring immediately draws two penalty
cards. This version has no draw-card stacking, jump-in, seven-zero swaps, or
Draw Four challenges. Final-card draw penalties apply before the winner is
recorded. First to empty their hand wins the round.

A seat becomes offline after 30 seconds without a heartbeat and is protected for
another 60 seconds. The table pauses if it is that player's turn. After the
deadline, the next room request removes the expired seat. Remaining players can
continue; the last player wins by forfeit. Explicitly leaving removes the seat
immediately. Rooms expire after 24 hours without activity.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts an isolated production build on port 3100 using the explicit
local memory adapter. Keep that port free. Its `.next-e2e` cache is separate from
your regular preview/build. Tests use isolated browser contexts for each guest.

CI also runs the actual transactional SQL and permission tests in a disposable
PostgreSQL 17 database named `uno_test`. To run them locally, supply a matching
`TEST_DATABASE_URL`; the test harness rejects other database names before changes.

```sh
npm run test:sql
```

For live Supabase verification, configure the dedicated app project in the
Git-ignored `.env.local`, then run:

```sh
npm run test:supabase
npm run test:e2e:supabase
```

Live tests create unique rooms and leave their own seats in cleanup. They do not
truncate hosted tables. Keep port 3100 free, run browser modes sequentially, and
use a dedicated test/app project rather than another application's database.
No test-only seed or delete endpoint is exposed by the app.

To verify a deployed site, set its plain origin as BASE_URL. This skips the
local web server and defaults to the durable Supabase expectation; no backend
secret is needed on the browser-test client.

```powershell
$env:BASE_URL='https://uno-online-three.vercel.app'
npm run test:e2e
Remove-Item Env:BASE_URL
```

Direct verification reads retry at most three connection resets. HTTP error
responses still fail their assertions immediately. Room creation is not retried
by this test transport.


See the [production deployment verification](docs/vercel-verification.md) and
the [current Supabase verification notes](docs/supabase-verification.md) for
actual local, CI and live results. [Earlier release notes](docs/verification.md)
describe the historical Redis implementation.

## Structure

```text
src/app/          Next.js pages and authenticated route handlers
src/components/   Landing, lobby, table, cards, dialogs, chat, sound
src/lib/game/     Pure serializable rules and transitions
src/lib/server/   Sessions, room service, Supabase RPC adapter, validation
src/lib/client/   Revision-safe polling and action handling
tests/            Rules, rooms, HTTP, storage and client tests
tests/sql/        Real PostgreSQL transaction and role-permission tests
supabase/         Private schema migrations and fifteen-minute maintenance
e2e/              Production browser journeys for independent players
docs/superpowers/ Approved specification and implementation plan
```

The server stores only hashes of opaque HttpOnly guest-session cookies. Visible
player IDs grant no access. Each snapshot contains the requesting guest's hand
and public opponent counts. Atomic compare-and-swap updates and bounded accepted
action IDs prevent conflicting writes and duplicate draws. Readiness/chat/presence
updates can safely retry across revisions; gameplay moves cannot silently replay
against newer state.

This is an independent fan project and is not affiliated with Mattel.
