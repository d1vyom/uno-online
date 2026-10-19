# Production deployment verification

Verified 20 October 2026 (Asia/Calcutta).

## Live release

- Public game: https://uno-online-three.vercel.app
- Hosting: Vercel Hobby, team-divyom, dedicated uno-online project.
- Framework: Next.js16.4.2 / React / Tailwind, Node.js24.
- Backend: the existing dedicated Supabase Free project, server-only production secrets.
- Region: iad1, near the Supabase US East database.
- Initial deployment: dpl_HfyWUd4canzW1T1x71rQYQPWcEbX, READY, exact reviewed Git commit3fe4bda976d268741e6a93c0724a7dd9ba5c7645; build27seconds.
- Preview deployment protection remains enabled; the public production alias requires no Vercel account.

No unrelated project was modified. No paid plan, add-on or domain was purchased.
SUPABASE_URL and SUPABASE_SECRET_KEY are Sensitive production variables; their
values were transferred from the ignored local file through stdin and never
printed or committed. The local configuration was preserved.

## Checks performed on the public HTTPS site

All seven production browser journeys passed in2.6minutes:

1. Four isolated guests join, ready, start, receive distinct private hands, play a complete round, chat, refresh and rematch. A fifth player is rejected. Wild-color UI, mobile table layout and accessibility are exercised during the journey.
2. A held background heartbeat does not discard readiness input.
3. A hung snapshot produces a recoverable error and restores the same private seat.
4. Offline recovery and refresh preserve membership; explicit host departure transfers ownership.
5. Named room creation/readiness survives refresh, and leaving returns home.
6. Mobile landing accessibility, no document overflow, keyboard dialog dismissal and focus restoration.
7. Joining an owned room after it was closed produces the expected recoverable missing-room message.

The full-round browser test collected page errors across all five contexts and
reported none. Screenshots were visually checked at desktop and360px mobile.

A separate public HTTPS/API smoke pass completed23checks, including downloaded
browser scripts: durable Supabase health, private no-store responses, invalid-name
rejection, room creation, Secure/HttpOnly/SameSite guest cookie, anonymous seat
access denial, cross-origin write denial, oversized-body rejection, duplicate
action idempotency, private-seat continuity, raw-state/credential-field omission,
no actual backend key or Supabase SDK in downloaded scripts, and owned-room cleanup.

Vercel production logs scanned over the testing window returned zero error-level
entries and zero HTTP5xx entries. These are observed test-window results, not a
promise about future uptime. Test rooms are left through their own guest sessions.

## Repeatable verification and fixes

BASE_URL selects a plain HTTP(S) origin for the existing Playwright suite, skips
the local web server and requires durable Supabase expectations. Default CI still
starts its isolated memory server. Ambiguous paths, URL credentials, query strings,
fragments and unsupported schemes are rejected. Backend credentials are not needed
on a client running deployed browser tests.

The first hosted run passed six journeys but a direct API read and cleanup hit
ECONNRESET. A real local HTTP server reproduced the dropped connection (RED).
Verification reads now use Playwright's bounded three connection-reset retries;
a separate real HTTP503 assertion proves HTTP service failures are not retried.
Cleanup leave retries keep the same serialized action ID. The rerun passed all
seven hosted journeys. Room creation is not automatically retried by this helper.

TDD evidence: target configuration8RED/9GREEN; reset boundary1RED/2GREEN.
All103core tests, lint and strict types passed. The103count includes the existing
game/rules/server tests plus11new verification tests. Three credential-dependent
live database tests remain separate from ordinary CI; they passed during the
previous storage release. Real PostgreSQL22-case validation remains mandatory CI.

One fresh read-only review of the verification change found no Critical,
Important or Minor issue. It deliberately excluded external verification and
unmodified game code; the deployed browser/API/log evidence above independently
covers those runtime boundaries. No application runtime code or dependencies
changed in this deployment task.

GitHub remains linked to the main production branch. Publishing these verification
files can create another build of the same application source; runtime source
identity can be checked with git diff3fe4bda..HEAD -- src package.json
package-lock.json next.config.ts vercel.json (expected empty).

## Scope of the result

The production game, its Supabase connection and the listed workflows were tested
on the real public URL. Free-tier quotas and provider availability still apply.
No paid external monitoring or artificial inactivity keep-alive was added.
