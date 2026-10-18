# UNO Online

**Good friends. Great rivalries.** A private card table for two to four people,
built with Next.js App Router, React, TypeScript, and Tailwind CSS.

Create a room, send your friends the link, and ready up. Play a complete round,
refresh without losing your seat, chat at the table, and come back for a rematch.
No accounts or downloads required.

## Run locally

Use Node.js 24. The Vercel project, CI, and development container use that version.

```powershell
npm ci
Copy-Item .env.example .env.local
Add-Content .env.local 'UNO_STORE=memory'
npm run dev
```

Open [localhost:3000](http://localhost:3000). Use separate browser profiles,
incognito windows, or devices for different players. Tabs in the same profile
share the guest cookie and therefore the same seat.

Memory mode is explicitly for local development: rooms disappear when the process
restarts. Its notice is visible in the lobby and game. For durable local games,
configure Redis as below and remove `UNO_STORE=memory`.

## Deploy to Vercel

The frontend and backend deploy together as one Next.js project. There is no
separate Express server, Socket.IO host, Codespace URL, or localhost backend URL.

1. Create a Redis database in [Upstash](https://console.upstash.com/) or install
   the Upstash Redis integration from the [Vercel Marketplace](https://vercel.com/marketplace).
   Pick a region close to your Vercel Functions region. Review the provider's
   current plan quotas before choosing a plan.
2. Copy the database's **REST URL** and **REST token**. In Vercel project settings,
   add these server-only environment variables for the environments you intend
   to use:

   | Variable | Value |
   | --- | --- |
   | `UPSTASH_REDIS_REST_URL` | The database HTTPS REST endpoint |
   | `UPSTASH_REDIS_REST_TOKEN` | The database REST token |

   Keep `UNO_STORE` unset. Never prefix the Redis variables with `NEXT_PUBLIC_`.
   Do not commit tokens. Vercel rejects development memory mode even if someone
   accidentally sets `UNO_STORE=memory`.
3. Import [d1vyom/uno-online](https://github.com/d1vyom/uno-online) into Vercel.
   Select **Next.js**, use the repository root as the Root Directory, keep
   `npm ci` for installation and `npm run build` for the build, and leave Output
   Directory at its Next.js default. If updating an older Vite project, clear its
   old `dist` output override and `frontend` root override.
4. Deploy or redeploy after adding the environment variables. A build does not
   need live Redis credentials; playing a hosted game does.
5. Open `/api/health`. A correctly configured deployment returns
   `{"status":"ok","storage":"redis","durable":true}`.
   Missing/unreachable storage returns HTTP 503 instead of creating unreliable
   in-memory rooms.
6. Create a room on the deployed URL, join from three other browser profiles or
   devices, ready all four players, and start. Refresh one device, play cards,
   exchange chat, finish, and rematch. This is the hosted verification step.

All moves use authenticated HTTP requests. Other visible players receive updated
snapshots about once per second. This turn-based transport needs no long-running
WebSocket server; Redis coordinates rooms across Vercel instances and deployments.
Polling consumes Vercel and Redis quotas. Keep an eye on usage and set provider
budgets if you need them; this project does not promise unlimited free hosting.

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

Managed Redis integration tests are skipped unless both Redis variables are set:

```sh
npm run test:redis
```

Use a **test database** for that command. Tests create a unique `uno-test:`
namespace and delete only their own keys. Running local memory tests does not
verify managed Redis or a Vercel deployment. See [verification notes](docs/verification.md)
for the actual checks and any remaining external setup.

## Structure

```text
src/app/          Next.js pages and authenticated route handlers
src/components/   Landing, lobby, table, cards, dialogs, chat, sound
src/lib/game/     Pure serializable rules and transitions
src/lib/server/   Sessions, room service, Redis CAS, validation
src/lib/client/   Revision-safe polling and action handling
tests/            Rules, rooms, HTTP, storage and client tests
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
