# Next.js Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user selects delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a polished UNO-style game for two to four friends, with a single Vercel-deployable Next.js frontend/backend and verified commits on GitHub main.

**Architecture:** Pure serializable game transitions feed a room service that validates every action and writes versioned rooms atomically to Redis. Next.js route handlers authenticate opaque guest cookies and return player-specific snapshots. React clients poll visible rooms about once per second and derive lobby, game, and results screens from the snapshot.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Upstash Redis REST SDK, Zod request validation, Vitest, Playwright, GitHub Actions. Resolve supported compatible releases at installation and retain exact resolved versions in package-lock.json.

**Spec:** [Approved design](../specs/2026-10-18-nextjs-multiplayer-design.md).

**Execution method:** Native implementation in this chat, selected by the user. The implementation follows this plan with the refinements recorded in the verification notes.

## Global Constraints

- Support two to four human players; four is the maximum, enforced by the server.
- Keep the existing repository and history. Preserve the configured author identity.
- Production rooms must never depend on in-memory function state, regardless of transport.
- No draw-card stacking, jump-in, seven-zero swaps, or Draw Four challenge flow.
- Use no-store response headers and never place private room responses in a CDN.
- Connected clients heartbeat at most every ten seconds; a player is offline after thirty seconds without a heartbeat. A sixty-second grace period then protects a disconnected seat.
- Initial creation uses SET NX; room expiration is refreshed atomically on activity, with a 24-hour inactivity TTL.
- Snapshot GET must not create guest sessions or join rooms implicitly.
- Local development may explicitly opt into a clearly labeled memory adapter; it must be impossible to select that adapter on Vercel.
- Document UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN as server-only environment variables.
- Full hosted multiplayer verification requires a configured Redis database and Vercel project access.
- Use RED, GREEN, then refactor for behavioral work. Record the actual failing and passing commands in the verification log.
- Complete checks before merging/pushing the implementation to main. Never force-push main.

## Review Focus

1. A delayed snapshot must not replace a newer accepted move; pin this in Task 5 client tests.
2. Two simultaneous joins to the last seat must not create a fifth player; pin this in Task 3 storage integration tests.
3. Two sessions claiming the same public player ID must not expose another hand; pin this in Task 4 authorization tests.
4. Removing the active player while direction is reversed must preserve the correct next turn; pin this in Task 2 engine tests.
5. A response lost after a successful draw must be safe to retry with the same action ID; pin this in Tasks 3 and 4 integration tests.

## File and interface map

- `src/lib/game/types.ts`: `Color`, `Card`, `GameState`, `GameAction`, and `GameError` contracts. Colors are red, blue, green, yellow; wild cards have a separate wild kind. Cards have unique IDs.
- `src/lib/game/engine.ts`: `createGame(playerIds: string[], random?: () => number): GameState`; `applyGameAction(state: GameState, actorId: string, action: GameAction, random?: () => number): GameState`; `removeGamePlayer(state: GameState, playerId: string, random?: () => number): GameState`; `canPlay(state: GameState, playerId: string, cardId: string): boolean`.
- `src/lib/server/types.ts`: stored `Room`, `RoomPlayer`, `RoomAction`, `RoomSnapshot`, `RoomStore`, and `ServiceError` contracts. Room phases are lobby, playing, finished. Rooms have schemaVersion 1 and monotonic revision.
- `src/lib/server/store.ts`: `getStore(): RoomStore`, `createMemoryStore(clock?: () => number): RoomStore`; explicit memory opt-in only outside Vercel. `RoomStore` exposes `read(code)`, `create(room, sessionHash)`, `commit(previousRevision, nextRoom, membershipChange?)`, `activeRoom(sessionHash)`, and `consumeLimit(key, maximum, windowSeconds)` as asynchronous operations. Create/commit atomically maintain the session-to-room membership index.
- `src/lib/server/redis-store.ts`: `createRedisStore(redis: Redis, namespace?: string): RoomStore`; room compare-and-swap, membership index, TTL, and rate counters implemented with atomic Redis operations/Lua.
- `src/lib/server/rooms.ts`: `createRoom(store, sessionHash, name, now?)`, `joinRoom(store, code, sessionHash, name, now?)`, `readRoom(store, code, sessionHash, now?)`, `actOnRoom(store, code, sessionHash, request, now?)`; each returns `Promise<RoomSnapshot>`. Requests include actionId, expectedRevision, and a validated RoomAction. Persist at most 100 recent accepted IDs per room and 100 chat messages; events are bounded to 30.
- `src/lib/server/snapshot.ts`: `projectRoom(room: Room, sessionHash: string, now: number): RoomSnapshot`; includes exactly one hand and public opponent information.
- `src/lib/server/session.ts`: `newSessionToken(): string`, `hashSessionToken(token: string): string`, `readSession(request: Request): string | null`; use Node crypto and a production-secure HttpOnly SameSite cookie.
- `src/lib/server/http.ts`: origin, body-size, validation, error mapping, and private no-store JSON helpers.
- `src/app/api/rooms/route.ts`: create; `src/app/api/rooms/[code]/join/route.ts`: join; `src/app/api/rooms/[code]/route.ts`: authenticated snapshot; `src/app/api/rooms/[code]/actions/route.ts`: room actions; `src/app/api/health/route.ts`: honest storage health.
- `src/lib/client/room-state.ts`: `acceptSnapshot(current: RoomSnapshot | null, incoming: RoomSnapshot): RoomSnapshot`; never regress revision.
- `src/lib/client/use-room.ts`: `useRoom(code: string)` provides snapshot, pending action, connection/error state, refresh, and `send(action: RoomAction): Promise<void>`.
- `src/components/`: `card.tsx`, `dialog.tsx`, `site-header.tsx`, `home.tsx`, `room.tsx`, `lobby.tsx`, `game-table.tsx`, `hand.tsx`, `chat.tsx`, `sound-controls.tsx`, `results.tsx`.
- `src/app/`: layout, home page, room page, loading, error, not-found, globals.css, metadata/icon. Keep page shells server-renderable and browser APIs inside client effects/events.
- `tests/`: engine, room-service, store, Redis integration, HTTP, and client revision tests. `e2e/`: four-player, reconnect, error, and responsive/accessibility journeys.
- `docs/verification.md`: commands, RED/GREEN evidence, screenshots, exact final results, and hosted verification limits.

## Task 1: Establish the migration workspace and runnable test harness

**Files:** root `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `tests/game/engine.test.ts`; add `docs/verification.md`.

**Interfaces:** Establish Vitest with the `@/` alias targeting `src/`. Task 2 consumes the engine signatures above. Preserve the existing app until its replacement can be built.

- [ ] Use the using-git-worktrees skill to select an isolated checkout and `codex/nextjs-multiplayer` implementation branch; retain the approved docs and existing audio assets.
- [ ] Add the test runner and TypeScript configuration. Write `creates a conserved 108-card four-player game`: assert four hands of seven cards, one numeric discard, 108 total cards, and 108 unique IDs.
- [ ] Run `npm test -- tests/game/engine.test.ts`; verify RED because the new engine is absent, with no unrelated runner/configuration failure.
- [ ] Record that failure and commit the harness and test as `test: establish multiplayer game acceptance harness`.

## Task 2: Implement and prove the complete rules engine

**Files:** `src/lib/game/types.ts`, `src/lib/game/engine.ts`, `tests/game/engine.test.ts`, `tests/game/fixtures.ts`.

**Interfaces:** Produce the four engine functions in the map. `GameAction` is play(cardId, optional color, optional uno), draw, pass, or uno. `GameState` holds ordered player IDs, hands, deck, discard, turn, direction, activeColor, drawnCardId, UNO declarations, and winner.

- [ ] Implement `createGame` to pass Task 1. Reject fewer than two, more than four, or duplicate player IDs. Avoid mutating input state.
- [ ] Add failing tests for legal color/value matches, unauthorized/out-of-turn play, invalid wild color, Draw Four matching-color restriction, skip/reverse, two-player reverse, and draw penalties before a final-card win.
- [ ] Run the engine test file and verify those cases fail for missing behavior. Implement `applyGameAction` and `canPlay`; rerun until GREEN.
- [ ] Add RED cases for one draw per turn, only the drawn card playable after drawing, pass, UNO arming/atomic declaration, the immediate two-card house penalty, and post-win mutation rejection. Implement and verify GREEN.
- [ ] Add RED cases for deck recycling, exhausted draw without a fabricated card, immutable rejected moves, disconnected-player removal in both directions, current-player removal while reversed, and one-player forfeit. Implement `removeGamePlayer` and verify GREEN.
- [ ] Run `npm test`; record results and commit `feat: implement tested deterministic multiplayer rules`.

## Task 3: Persist secure rooms with atomic transitions

**Files:** `src/lib/server/{types,store,redis-store,rooms,snapshot}.ts`; `tests/server/{rooms,store,redis-store}.test.ts`; `.env.example`.

**Interfaces:** Consume engine functions and produce the RoomStore and room-service signatures in the map. Inject store and time into service tests. Redis and memory adapters obey the same contract; the latter remains development/test-only.

- [ ] Write RED service tests: creation and collision retry; invalid names/codes; membership required; private hand projection; only one active room per session; four-player limit; shared readiness; connected/ready start conditions; active-round restart rejection; no mid-game join; bounded chat/events; host-only rematch with readiness reset and retained wins.
- [ ] Run `npm test -- tests/server/rooms.test.ts`; implement minimal service, projection, and memory store until GREEN. Invalid actions leave stored state unchanged.
- [ ] Write RED tests using an injected clock: offline after 30 seconds, protected until 90 seconds since last heartbeat, active offline player's turn paused, throttled heartbeat, expiry processing, directional removal, host transfer, immediate leave, forfeit, and empty-room deletion.
- [ ] Implement those lifecycle transitions without timers; run service tests to GREEN.
- [ ] Write RED storage-contract tests for expected revision, duplicate action replay, 24-hour inactivity TTL, session-index cleanup, creation throttling, and bounded retry after storage conflicts. Implement contract behavior and verify GREEN.
- [ ] Write managed Redis integration cases: two adapter instances share a room; concurrent fourth/fifth joins yield four seats; concurrent same-revision actions yield one mutation; a repeated draw action ID changes the hand once; expiry clears room/indexes; orphaned membership indexes are recovered safely. Use isolated key namespaces and clean only test-owned keys.
- [ ] Implement `createRedisStore` with atomic Lua commits and retry-safe IDs. Run `npm test -- tests/server/redis-store.test.ts` against configured Redis and record actual results. If credentials are unavailable, retain an explicitly skipped integration suite and report hosted verification as incomplete.
- [ ] Verify memory opt-in is rejected whenever VERCEL is set, and that missing production credentials return ServiceError with status 503. Commit `feat: add atomic persistent rooms and private sessions`.

## Task 4: Expose authenticated Next.js API contracts

**Files:** root Next.js/Tailwind/ESLint configuration; `src/lib/server/{session,http}.ts`; all mapped API routes; `tests/server/http.test.ts`; `tests/server/session.test.ts`; root `vercel.json`.

**Interfaces:** Consume the room service. Create/join can establish the opaque guest cookie; snapshots/actions require it. Action envelopes contain expectedRevision, actionId, and action. Status mapping: validation 400, authentication 401, forbidden 403, absent room 404, conflict/full room 409, rate limit 429, storage failure 503.

- [ ] Add RED contract tests for malformed/oversized JSON (limit 8 KiB), foreign Origin, missing or tampered cookie, malicious declared color, spoofed actor ID, stale revision, duplicate retry, no-store headers, no secrets in responses, and GET not creating a session or seat.
- [ ] Configure root Next.js/React/Tailwind and implement session/HTTP helpers and named route exports. Use runtime schemas at trust boundaries and cryptographic random tokens/codes. Run contract tests until GREEN.
- [ ] Confirm two sessions supplying the same public player ID cannot read the same private hand; client payloads cannot select the authenticated actor.
- [ ] Wire creation/IP throttles and session/action throttles through shared storage. Rate-limit rejection returns a readable error and Retry-After.
- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`; fix failures. Commit `feat: serve secure multiplayer APIs through Next.js`.

## Task 5: Build the responsive game experience

**Files:** mapped app shells/components and client files; `public/sounds/`; `tests/client/room-state.test.ts`; `playwright.config.ts`; `e2e/room.spec.ts`; `e2e/accessibility.spec.ts`.

**Interfaces:** Consume RoomSnapshot and RoomAction. Only the room hook owns networking. Components request actions without deriving authority or reading private server modules.

- [ ] Write a RED revision test: accepting revision 12 then revision 11 retains revision 12. Add browser acceptance cases for name validation, create/join, four named lobby seats, real shared readiness, start conditions, invite copying, and direct room URLs.
- [ ] Run the relevant tests to RED, then implement the room hook and landing/lobby pages. Poll visible tabs at roughly 1 second, heartbeat at most once per 10 seconds, fetch immediately on visibility restore, abort superseded fetches, back off on errors, and serialize pending actions. Reuse the action ID on safe network retries; show conflicts and refresh instead of automatically replaying a stale move.
- [ ] Add RED browser cases for legal-card hints, draw/pass, named wild-color dialog, UNO, opponents' hidden hands, sorting, chat, results/rematch, and explicit leave. Implement the playing/results views to GREEN.
- [ ] Style the warm off-white landing/lobby and dark green tabletop using Tailwind. Keep three opponent seats legible and the local hand horizontally scrollable on small screens. Reuse suitable existing audio with optional persisted mute/volume settings and rejected-playback handling.
- [ ] Add RED checks for keyboard cards, dialog Escape/focus restoration, live errors, 360px layout without horizontal page overflow, reduced motion, accessible names, and no hydration/console errors. Implement native buttons/dialogs and focus behavior; verify GREEN.
- [ ] Run the focused browser suites and all unit tests; inspect desktop/mobile screenshots. Commit `feat: build responsive lobby and multiplayer tabletop`.

## Task 6: Verify four-player play and finish the migration

**Files:** `e2e/multiplayer.spec.ts`, `e2e/reconnect.spec.ts`, `README.md`, `.github/workflows/ci.yml`, `.devcontainer/devcontainer.json`, `docs/verification.md`; remove legacy frontend/backend and workspace configuration once replaced.

**Interfaces:** Exercise the actual app through HTTP/browser contexts. Deterministic fixtures belong to test utilities and test-owned storage; no production-accessible seed/debug endpoints.

- [ ] Write a RED four-context journey: create one room, join three players, reject a fifth, synchronize readiness, start, compare public revisions and distinct private hands, perform legal play/draw/pass and wild choices, refresh a player, exchange chat, finish a round, and rematch. Use test-owned seeded storage where deterministic card order is necessary.
- [ ] Write RED network/host cases: lost move response and retry, temporary offline recovery, expired seat, host leave/transfer, stale action, missing room, full room, and unavailable storage. Fix the real flow until browser checks pass.
- [ ] Remove replaced Vite/Express code, duplicate types, old lock/workspace references, tracked environment configuration, and Codespace URLs. Move retained sound assets to root public. Update the devcontainer for one Next.js server.
- [ ] Document installation, local explicit memory mode, the full rules/house penalty, Redis provisioning, server-only variables, Vercel repository-root setup, storage costs/limits, deployment verification, and all test commands. Mark managed Redis/hosted checks accurately.
- [ ] Add CI with clean npm install, lint, typecheck, unit tests, production build, and browser tests. CI tests use a clearly explicit local adapter unless test Redis secrets are supplied; never silently fall back for production.
- [ ] Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, and the managed Redis suite when configured. Record outputs, counts, screenshots, and unresolved external dependencies in docs/verification.md.
- [ ] Use verification-before-completion and requesting-code-review skills. Review the full diff for private-state leaks, production memory fallback, stale updates, missing rule cases, accessibility, and accidental secrets. Fix and rerun only checks relevant to new changes, plus the final project test suite.
- [ ] Commit the verified deliverable, use finishing-a-development-branch to integrate into main, and push all implementation commits without force. Verify remote SHA equals local main and inspect CI/deployment status. If main is protected, preserve commits on the feature branch and follow the repository's merge requirements.
- [ ] Report the completed app, actual checks, main commit, and any missing Redis/Vercel configuration. Do not claim hosted multiplayer is verified without exercising a configured deployment.

## Plan self-review

- Spec coverage: migration, rules, privacy, atomic state, guest identity, readiness, presence, reconnect, chat, sound, rematch, visual direction, accessibility, deployability, tests, documentation, and main push map to Tasks 1–6.
- Interface consistency: the engine feeds the room service; storage contracts feed both adapters; the HTTP layer feeds RoomSnapshot/RoomAction to the single room hook.
- Review Focus coverage: delayed snapshots in Task 5; seat races and lost-response retry in Task 3; identity spoofing in Task 4; reversed removal in Task 2.
- Real external verification remains distinct from local test results. Missing credentials are documented dependencies, never substituted with a production memory store.
- Product implementation starts only after this plan is reviewed and the execution method is selected.
