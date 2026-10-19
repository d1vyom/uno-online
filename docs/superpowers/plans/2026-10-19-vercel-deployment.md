# Vercel deployment and hosted verification

Operational continuation of the approved UNO/Supabase specification. User explicitly requested deployment and complete-game verification. Native execution; no new product architecture or game features.

## Specification

Deploy the reviewed main commit to the existing user's Vercel Hobby team. Create only the dedicated uno-online project. Configure Next.js, Node24, repository root and default output, functions near Supabase US East. Transfer the existing local Supabase credentials through stdin as server-only production secrets. Preserve .env.local and never print secret values. Keep preview deployment protection enabled. Do not purchase resources or change unrelated applications.

The same seven Playwright journeys must exercise the actual HTTPS production origin: four isolated private hands, fifth-seat rejection, readiness/start, full round, wild choices, chat, refresh, rematch, mobile accessibility, offline recovery, hung snapshots, delayed heartbeats and host transfer. Confirm public health reports durable Supabase and scan runtime errors. Clean only owned rooms.

## Plan

- [x] Confirm account/team Hobby, project identity, exact Git source and production environment; provision/link and upload secrets safely.
- [x] Start production deployment from reviewed main3fe4bda.
- [x] TDD the browser target configuration: a remote origin skips the local server and defaults to Supabase; reject malformed origins/memory targets; preserve local defaults.
- [ ] Use the target origin in all API requests and cleanup. Run core/type/lint checks and the seven deployed browser journeys.
- [ ] Check production alias, health, secure guest cookies, client/server error evidence, cleanup, and runtime logs. Fix any reproduced defects with RED/GREEN.
- [ ] Commit/push repeatable verification tooling and final evidence to main; verify the resulting deployment/CI and report actual limitations.

## Execution evidence

The dedicated Vercel project prj_K04jI5ZScFClgKVvsUHdF2BuTc5Q belongs to team-divyom (Hobby). Existing frontend belonged to VolHelix-AI and was left untouched. The connector lacked team scope, so its mapped CLI fallback used the same authenticated user and explicit team. Production secrets were sent from .env.local through stdin. Vercel linking added its OIDC variable while preserving the user's Supabase values.

Production deployment dpl_HfyWUd4canzW1T1x71rQYQPWcEbX reached READY from exact reviewed commit3fe4bda, built in27seconds, regioniad1. Public alias: https://uno-online-three.vercel.app. Preview protection remains enabled.

Target configuration RED:8 failures/1pass. GREEN:9cases. Initial hosted suite:6pass,full-round API read and cleanup failed with ECONNRESET; Vercel error scan was empty. Transport regression against a real local HTTP server reproduced one dropped connection (RED1/GREEN2); bounded Playwright GET retries recover resets while an HTTP503 is returned once. Cleanup leave retries preserve the same action ID. Core total103passed. No product code changed. Public HTTPS smoke23checks passed (including downloaded client chunks); failed-run room was recovered through its own guest cookie and returned404.
