# Migration verification

Implementation branch: codex/nextjs-multiplayer. Native execution approved.

## Baseline

The original Vite/Express build passed. Frontend lint had seven errors.
No game/API/browser tests existed. Git push access was verified.

## TDD evidence

Results are appended as each behavioral layer is implemented.

## External dependencies

Managed Redis and a configured Vercel deployment are required for hosted
multiplayer verification. Local checks do not establish hosted behavior.

## Production browser verification

`npm run test:e2e` builds an isolated production app and starts it on port 3100.
The final run passed all five browser tests in 1.4 minutes:

- Four independent players join, ready, start, play a complete round, refresh,
  exchange chat, finish, and rematch; a fifth player cannot join.
- Initial private hands contain 28 distinct card IDs and agree on the public pile.
- A 360px game layout has no horizontal page overflow; the hand scrolls internally.
- Network recovery, refresh recovery, host departure, and host transfer work.
- The landing, lobby and table pass the exercised axe accessibility checks.
- The rules dialog closes with Escape and restores focus.
- Missing rooms have recoverable errors; there are no JavaScript page errors in
  the complete multiplayer journey.

Desktop and mobile captures are in [screenshots](screenshots/).

## Verification-driven refinements

- Use a production build for acceptance tests; two development servers watching
  the same source caused repeated reloads. The test cache remains `.next-e2e`.
- Readiness, chat, and heartbeat describe independent intent and retry under CAS.
  A separate private action revision tracks game/membership changes, so background
  presence does not invalidate legal moves. Changed game state still rejects a
  stale action. New regressions failed before both fixes and passed afterward.
- Corrected mobile grid min-width, muted-text contrast, tab-panel semantics, and
  visible/control-name agreement from actual browser and axe failures.
- Replaced the Next-specific ESLint preset with standard ESLint, TypeScript and
  React Hooks rules because its current glob dependency has an unpatched advisory.
  The resulting complete dependency audit reports zero vulnerabilities.

## Hosted verification limit

The user has no Upstash database and requested setup instructions. The two managed
Redis integration tests are explicitly skipped without credentials. Neither
managed Redis nor a live Vercel deployment has been exercised. The Docker CLI was
available but its daemon was not running, so no local Redis service was started.
The production Redis adapter, atomic scripts, integration tests and full setup
instructions are included; credentials are never synthesized or committed.
- Engine RED: creation/action suites ran against explicit unimplemented engine functions; creation, legal play, effects, draw phases, UNO, and departures fail as expected before implementation.
- Engine GREEN: 26/26 tests pass, including private hand ownership enforcement, all action effects, draw phases, UNO penalties, recycling, and reversed-turn departures.
- Rooms RED: 17 cases failed against unimplemented storage. Rooms GREEN: all 17 passed after room, presence, privacy, readiness, CAS, TTL and retry behavior were implemented. Redis integration tests are explicitly skipped without managed test credentials.
- HTTP GREEN: 50 tests pass; malformed/oversized JSON, foreign origins, cookie authentication, spoofed actors and stale actions are rejected. Next.js production backend build and strict typecheck pass without Redis credentials.
- Concurrent readiness regression RED: only one of two simultaneous ready updates succeeded. GREEN: independent readiness/chat/heartbeat updates now retry atomically; dependent gameplay actions still reject stale revisions.
