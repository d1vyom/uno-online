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
Before final review, all five browser tests passed in 1.4 minutes:

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

## Independent review and regression fixes

A fresh read-only reviewer checked the complete implementation against the plan.
Its three Important findings were reproduced and fixed:

- A held heartbeat could silently drop a ready click. Heartbeats now run without
  taking the foreground action lock. A real browser test holds that request open
  while verifying the ready click succeeds.
- A hanging snapshot could block every later refresh. Snapshot requests now have
  a 12-second deadline and success-based polling backoff. A browser regression
  verifies timeout feedback and recovery of the same private seat.
- The installed Upstash SDK automatically deserialized numeric room codes into
  numbers. The adapter now normalizes non-null membership codes to strings. The
  regression uses the real SDK and a correctly base64-encoded REST response.

The departed-winner finding was treated as a result-correctness issue: the room
now retains the recorded winner's display name after departure. A service
regression verifies that the remaining guests still see the correct winner.
An additional HTTP contract test ignores a successful draw response and verifies
that retrying the same action returns an eight-card hand, rather than drawing twice.

The review's unverified external areas (managed Redis and hosted Vercel) remain
explicit limitations. Accounts, matchmaking, challenge rules, and leaderboards
remain outside the approved scope. No review finding is silently deferred.

## Final local checks

After the review fixes, the complete production browser suite passed **7/7** in
1.4 minutes. A fresh `npm ci` then passed, followed by:

| Check | Result |
| --- | --- |
| ESLint | Passed, no errors |
| Strict TypeScript and generated route types | Passed |
| Vitest | 57 passed; 2 managed-Redis tests explicitly skipped |
| Next.js production build | Passed, all pages and API routes generated |
| Complete npm audit | 0 vulnerabilities |

Node.js is pinned to 24.x to match CI, the development container, and the
installed tooling. Generated `next-env.d.ts` is ignored because Next.js rewrites
its paths when switching between normal and isolated test builds.

## Implementation decisions

| Decision | Reason and tradeoff |
| --- | --- |
| Standard ESLint/TypeScript/Hooks rules | Eliminates the preset's vulnerable transitive glob dependency; omits Next-specific lint heuristics, while build/type/browser checks remain required. |
| Production-mode browser test server | Matches shipped behavior and avoids development reload interference; adds a build to browser-test startup. |
| Independent lobby/chat/presence retries | Prevents harmless concurrent updates from rejecting user intent; retries are bounded and every write still uses CAS. |
| Private gameplay/membership revision | Presence and chat do not invalidate legal moves; stale gameplay must still be rejected, as pinned by the concurrency tests. |
| Preserve a departed winner's name | Supported departures must not corrupt another guest's results screen; adds one nullable room field. |

The independent review's three Important findings and winner-name correction are
fixed with regression evidence. There are no deferred review findings.
- Engine RED: creation/action suites ran against explicit unimplemented engine functions; creation, legal play, effects, draw phases, UNO, and departures fail as expected before implementation.
- Engine GREEN: 26/26 tests pass, including private hand ownership enforcement, all action effects, draw phases, UNO penalties, recycling, and reversed-turn departures.
- Rooms RED: 17 cases failed against unimplemented storage. Rooms GREEN: all 17 passed after room, presence, privacy, readiness, CAS, TTL and retry behavior were implemented. Redis integration tests are explicitly skipped without managed test credentials.
- HTTP GREEN: 50 tests pass; malformed/oversized JSON, foreign origins, cookie authentication, spoofed actors and stale actions are rejected. Next.js production backend build and strict typecheck pass without Redis credentials.
- Concurrent readiness regression RED: only one of two simultaneous ready updates succeeded. GREEN: independent readiness/chat/heartbeat updates now retry atomically; dependent gameplay actions still reject stale revisions.

## GitHub publication

Implementation commit 216e0d9 was merged into main and pushed successfully. The merged checkout passed a fresh npm ci, 57 local tests, and a production build. The remote main SHA matched the local SHA, and the GitHub API attributed both author and committer to d1vyom. The automated workflow is available in [GitHub Actions](https://github.com/d1vyom/uno-online/actions).
