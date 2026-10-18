# UNO Online: Next.js multiplayer migration

Date: 2026-10-18
Status: Proposed specification for user review. Implementation has not started.

## Intended outcome

Replace the existing Vite frontend and standalone Express backend with a single
TypeScript, React, Next.js App Router application, styled with Tailwind CSS and
deployable to Vercel. Four friends must be able to share a private room, play a
complete game, recover after refresh or a brief connection loss, and play again.
Support two to four human players; four is the maximum, enforced by the server.

The user authorized feature improvements, meaningful commits, and pushing or
merging the completed work to the existing GitHub repository's main branch.
Keep the existing repository and history. Preserve the configured author identity.
Do not manufacture commits or promise GitHub contribution attribution; the author
email must belong to the user's GitHub account for GitHub to attribute commits.

Assumptions: private games with friends are the primary use case; guests can play
without an account; a single round ends when a player empties their hand. Accounts,
ranked matchmaking, payments, and a global leaderboard are outside this release.

## Repository review and baseline

Reviewed the tracked frontend and backend source, type definitions, styles,
configuration, environment examples, development container, package scripts,
audio assets, Git status, and recent history.

- Frontend: React 18, Vite 5, Tailwind 3, React Router, Framer Motion, Socket.IO.
- Backend: Express, Socket.IO, mutable game engine, process-local room maps.
- The Vercel configuration selects Vite and a root dist output, while the frontend
  build writes frontend/dist and the backend requires a listening Node process.
- Readiness is component state and is never synchronized or checked on the server.
- Initial game broadcasts can precede the game screen's event subscription.
  Direct navigation and refresh do not reliably request a complete snapshot.
- Player identity is a client-chosen ID; another client can claim that ID.
- Rejoining an existing room returns the internal room object. Once a game exists,
  that object includes engine internals; use explicit private projections instead.
- Rooms disappear with a process restart and do not coordinate across instances.
- Starting a game again can replace an active game. Wild colors are not checked
  against a runtime allowlist. Wild Draw Four has no matching-color restriction.
- The first action card's effect is ignored. Drawn cards cannot be played in the
  same turn. Disconnect removal and turn direction need explicit coverage.
- Interactive cards are div elements. Color choices and several controls lack
  accessible names. Large hands, reduced motion, and modal focus need attention.
- backend/.env is tracked. It currently contains server configuration keys;
  replace this pattern with ignored local environment files and safe examples.
- No automated game, API, or browser tests are present.

Baseline checks run before modification:

| Check | Result |
| --- | --- |
| Root npm run build | Passed: Vite frontend and TypeScript backend |
| Frontend ESLint | Failed: seven explicit-any errors and one refresh warning |
| Frontend TypeScript no-emit check | Passed |
| Git working tree before planning | Clean |
| Remote update | One README-only commit; safely fast-forwarded local main |

GitHub CLI currently reports no authenticated hosts. Public Git fetch succeeds;
write access still needs verification when pushing. No Redis configuration was
found in the inspected project environment. Neither fact prevents local work.

## Architecture options

1. **Recommended: Next.js HTTP endpoints and shared Redis, with short polling.**
   All application code deploys in one Vercel project. Moves complete immediately
   through POST endpoints; other players refresh authenticated snapshots about
   every second while the page is visible. This fits a turn-based card game and
   avoids a second application server. It requires Redis credentials, and polling
   consumes request and Redis quotas; do not advertise unlimited free operation.
2. **Next.js native WebSockets with shared state and cross-instance messaging.**
   Vercel now documents WebSocket support, including a Next.js upgrade API.
   This lowers update latency but introduces instance coordination, connection
   rotation, reconnect subscriptions, and additional local testing requirements.
3. **Next.js with a managed realtime backend.** Supabase or another realtime
   service can synchronize state, but introduces another access model and service
   integration for this otherwise small game. Prefer it only if the project later
   needs accounts, persistent profiles, or public matchmaking.

Choose option 1 for this release. Polling is an explicit transport decision,
not a claim that Vercel cannot run WebSockets. Production rooms must never depend
on in-memory function state, regardless of transport.

## Application structure

- src/app: landing page, room route, layout, error and missing-page states,
  metadata, and Next.js route handlers.
- src/components: accessible cards, player seats, lobby, table, hand, chat,
  dialogs, connection status, and sound controls.
- src/lib/game: serializable state types and pure rules/transitions, with injected
  random and clock sources in tests.
- src/lib/server: guest-session validation, room service, Redis storage adapter,
  request validation, private-state projection, and shared rate limits.
- src/lib/client: room polling, cancellation, action handling, and local settings.
- tests: engine, room service/API contracts, production storage integration,
  and Playwright multi-context browser flows.

Remove the obsolete Vite/Express workspace setup after its useful rules and assets
have been migrated. Keep one root lockfile and conventional dev, build, start,
lint, typecheck, test, and test:e2e scripts. Pin compatible supported releases at
implementation time. Do not retain duplicate production backends.

## Room lifecycle and identity

1. A visitor enters a display name, then creates a room or joins with a six-character
   code or invite link. Generate codes with cryptographic randomness; reserve them
   atomically with collision retries. Validate names and normalized codes.
2. Create a cryptographically random opaque guest-session token in an HttpOnly,
   SameSite cookie, Secure in production. Keep only its hash in server storage;
   never expose it or use a visible player ID as authentication.
3. Bind each session to at most one active room. A move resolves the actor from
   the session, checks room membership, and authorizes the requested action.
4. The lobby shows four named seats, host status, shared readiness, connection
   state, room code, copyable invite link, and bounded room chat.
5. Only the host can start, with at least two connected players and every seated
   player ready. Reject a second start while a round is active.
6. A single /room/[code] route derives lobby, playing, and results views from the
   server snapshot. Refresh loads the latest view without router memory.
7. Connected clients heartbeat at most every ten seconds; a player is offline
   after thirty seconds without a heartbeat. Background tabs stop rapid polling
   and fetch immediately when visible again. A sixty-second grace period then
   protects a disconnected seat. The server records deadlines; any subsequent
   room request atomically processes expired seats, with no process timers.
8. Disconnected players pause play when their turn arrives. After the grace
   deadline, remove them, recycle their hand, and advance correctly for the current
   direction. Transfer host status to the next remaining player. One remaining
   player wins by forfeit; an empty room is removed.
9. Explicit leave removes the seat immediately. Finished games offer a rematch
   that returns everyone to the same lobby with readiness reset and room wins
   retained. Do not add new players during an active round.

## State consistency and private information

Persist each room as JSON with schema version, monotonic revision, host, phase,
players, presence deadlines, deck, discard, turn phase, active color, direction,
UNO status, bounded chat and recent events, and room-scoped win counts.

Use Redis compare-and-swap with an atomic Lua script to commit a new revision
only when the stored revision matches the read revision. A POST includes the
expected revision and a unique action ID. Keep a bounded record of accepted action
IDs per session/room so retries cannot draw twice or send duplicate messages.
Readiness, join, leave, host transfer, and game actions use the same concurrency
guarantees. Initial creation uses SET NX; room expiration is refreshed atomically
on activity, with a 24-hour inactivity TTL. Rate-limit keys expire independently.

Snapshots include only the requesting player's hand and public state: opponent
names and counts, readiness, connectivity, turn, top discard, chosen color,
direction, last public actions, winner, and room score. They never include the
draw pile order, opponent hands, cookies, token hashes, or internal stored state.
Use no-store response headers and never place private room responses in a CDN.

Clients allow one pending action and ignore older revisions. Conflicts trigger a
fresh snapshot and a clear retry message. Abort superseded fetches; retry temporary
network failures with bounded backoff and a visible reconnect state. Do not show
an unconfirmed move as accepted. Snapshot GET must not create guest sessions or
join rooms implicitly. Reject cross-origin mutations and enforce bounded payloads,
runtime validation, session-based throttling, and an IP-based creation limit.

## Game rules for this release

Document this simplified ruleset in the UI; do not claim every official rule.

- A 108-card deck, seven cards per player, and a number card as the initial discard.
  Return action/wild candidates to the deck and reshuffle before the opening draw.
- Play by matching color or value; wild chooses one of four validated colors.
- Skip bypasses the next player. Reverse changes direction; in a two-player game
  it acts as skip. Draw Two and Wild Draw Four force draws and skip the victim.
- No draw-card stacking, jump-in, seven-zero swaps, or Draw Four challenge flow.
- Wild Draw Four is legal only if the actor holds no card of the active color.
- Drawing takes one card. If playable, only that drawn card may be played, or the
  player may pass; otherwise advance the turn. Drawing again is rejected.
- A player at two cards can arm UNO before playing, or combine UNO with the play
  action atomically. Leaving one card without declaring applies a documented
  immediate two-card house penalty. Drawing resets the declaration.
- Resolve forced draws before declaring a final-card win. Reject every mutation
  once the round is finished except leaving or the host's rematch action.
- Recycle all but the top discard when the deck empties. Never fabricate an
  empty card; an exhausted draw safely passes and emits an explanatory event.
- Check card conservation, unique IDs, turn validity, hand ownership, immutable
  transitions, and terminal state behavior in deterministic tests.

## Interface and feature improvements

Use an original tabletop direction: warm off-white page surfaces, deep charcoal
type, a dark green playing table, and crisp red, blue, yellow, and green cards.
Use strong typography, restrained borders, generous spacing, and short purposeful
transitions. Avoid decorative gradients and excessive glowing effects.

The landing page pairs a strong game preview with clear create/join actions and
an accessible how-to-play dialog. The lobby has four explicit seats, invite
sharing, names, synchronized readiness, and an explanation of the start condition.
The table places three opponents around a compact central pile and keeps the
local hand usable on mobile. Provide horizontal hand scrolling and hand sorting,
legal-move hints, draw/pass controls, UNO, a turn indicator, color text and symbols,
recent public actions, chat, optional sound, and results/rematch controls.

Cards are native buttons with full accessible labels. Dialogs have focus handling,
Escape support, and focus restoration. Announce turn and error changes using live
regions. Support keyboard operation, visible focus, reduced motion, adequate
contrast, touch targets, and explicit sound preferences. Audit and reuse suitable
existing audio assets; handle rejected playback without affecting gameplay.

## Proposed delivery sequence

1. Review this specification, then write the detailed Superpowers implementation
   plan with the selected execution method. Use TDD throughout behavioral work.
2. Establish failing deterministic tests for the rules and privacy boundaries;
   implement the smallest pure game model that makes them pass.
3. Establish the root Next.js/React/Tailwind toolchain and routes, then remove
   obsolete workspace plumbing and correct Vercel configuration.
4. Add failing storage and room-service tests; implement sessions, atomic room
   updates, readiness, reconnect deadlines, rate limits, and private projections.
5. Add failing route-contract tests; wire validated Next.js HTTP endpoints and
   predictable error responses to the tested service.
6. Build the responsive landing, lobby, table, chat, sound, and rematch experience
   against those contracts. Add meaningful browser flows for the user journeys.
7. Verify with four isolated browser sessions, a production build, and the real
   Redis adapter. Fix failures and inspect desktop/mobile renders.
8. Update README and environment/setup instructions, add CI, review the final diff,
   make meaningful commits, then push the verified work to main without force.
   Check the resulting remote SHA and CI status. If write access fails, preserve
   all commits locally and request only the missing GitHub authentication.

## Verification and release criteria

- RED then GREEN evidence for engine behavior, concurrency, membership, private
  snapshots, readiness, rematch, and reconnect/leave behavior.
- Lint, strict TypeScript, unit/integration tests, and production build pass.
- Real Redis integration tests prove atomic conflicts, duplicate retries,
  cross-adapter persistence, expiration, and no fifth-player race. A local Redis
  emulator may help development but is not proof of managed Redis deployment.
- Four independent Playwright browser contexts create/join one room, ready up,
  start, see distinct private hands and consistent public state, play/draw/pass,
  refresh/reconnect, exchange chat, finish, and rematch. A fifth join is rejected.
- Browser tests check stale moves, unauthorized actions, wild-color selection,
  direct room navigation, missing/full rooms, service outages, and host departure.
- Verify small mobile and desktop layouts, keyboard interactions, reduced motion,
  no horizontal page overflow, accessible dialogs, console errors, and hydration.
- Vercel uses Next.js at the repository root. No localhost/Codespace URL, standalone
  server, or process-local room store is required in production.
- Production missing Redis configuration yields an actionable service-unavailable
  response. Local development may explicitly opt into a clearly labeled memory
  adapter; it must be impossible to select that adapter on Vercel.
- Document UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN as server-only
  environment variables. No credentials are committed or exposed to the browser.
- The app can build without live runtime credentials. Full hosted multiplayer
  verification requires a configured Redis database and Vercel project access.
- Do not claim a live deployment or successful hosted multiplayer until actually
  exercised. The requested scope is deployable software plus the GitHub main push;
  any production deployment caused by an existing Git integration must be checked.

## Official platform references checked during planning

- Next.js route handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Tailwind with Next.js: https://tailwindcss.com/docs/installation/framework-guides/nextjs
- Vercel WebSockets and external durable state: https://vercel.com/docs/functions/websockets
- Vercel storage integrations: https://vercel.com/docs/storage
- Upstash HTTP Redis API: https://upstash.com/docs/redis/features/restapi
- Upstash Lua evaluation: https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval
