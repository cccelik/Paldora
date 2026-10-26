# Claude Code handoff: Firebase migration quality audit

Copy the prompt below into Claude Code from the Paldora repository root.

---

You are taking over Paldora, a privacy-first social scrapbook monorepo. Your task is to independently audit the completed **local Firebase migration**, verify the data and application quality end to end, fix confirmed local defects, and produce an evidence-based report. Do not assume a feature is correct just because the tracker calls it complete. Read `CLAUDE.md` and any applicable `AGENTS.md` before editing.

## Current state and decisions

- The migration was committed as `897ee68` (`Complete local Firebase web migration`) and pushed to `main`. Commit `051f5a7` separately added visual concepts and a pitch video. Inspect the current branch and worktree first; those hashes are a baseline, not a substitute for checking the actual checkout.
- All eight phases of the **local** migration are marked complete in `docs/firebase/implementation.md`. This means emulator and local-web parity, **not** hosted production readiness. The active workspace no longer uses the old NestJS HTTP API, worker, PostgreSQL, Supabase, Redis, S3/MinIO, or their active packages. `legacy/` is a frozen behavior reference. Never edit it or restore a runtime dependency on it.
- The web app uses Next.js Server Components, Server Actions, and a few authenticated same-origin route handlers. `apps/web/app/lib/server/firebase/data.ts` is the server-only web adapter; `@paldora/firebase-trusted` holds trusted business logic and authorization, using Firebase Admin SDK. The browser must not receive Admin credentials or direct access to application Firestore/Storage data. Functions in `apps/firebase-functions` perform durable jobs and future-client callables. The local stack uses Firebase Auth, Firestore, Storage, Functions, and Pub/Sub emulators under `demo-paldora`.
- Identity uses operator-provisioned UUID Firebase Auth UIDs, seven-day HttpOnly/Secure/SameSite session cookies, revocation/account-status checks, origin checks on mutations, Firebase password recovery and password reauthentication. Public signup is disabled. The hosted `paldora-dev` project stays on Spark; do not link billing, deploy, change hosted rules, or enable signup. Hosted Firestore/Storage application-data rules remain deny-all. `firebase/firestore.native.rules` is a separate future-client experiment; do not assume it governs the server-only web path.
- Chosen product rules: deletion has an exact seven-day cancellation window, requires prior transfer of every owned Box, and uses generation-tagged resumable erasure; exports are `paldora-json-v1` JSON archives with media **metadata**, not media bytes, and expire after seven days; closed moderation-case evidence retention is 90 days; moderator takedowns close reads and physically retire affected media before success; restoration of retired media needs reprocessing or a new upload. The external appeal/moderation email is unset, and public signup must stay closed.

## What was implemented locally

1. **Parity and cutover:** `docs/firebase/parity-matrix.json` maps 90 canonical old API routes (the earlier 92 estimate was corrected), their web surfaces, validation, authorization, and replacement tests. `scripts/check-firebase-cutover.mjs` rejects active legacy runtime imports. The old HTTP API and old infrastructure packages were removed from the active workspace; historical behavior remains in `legacy/`.
2. **Identity:** Firebase web session flow, onboarding, profile, username, preferences, suspension and unadmitted-account handling, password recovery, password changes, session-epoch rotation, and CSRF/origin protections.
3. **Social and Boxes:** friendship requests/accept/decline/cancel/removal, directional blocks, Box invitations and sender/recipient views, roles, ownership transfer, member management, archive, and resumable owner-only deletion. Box deletion first marks the Box `deleting`, blocks reads and writes, retires media, and cleans dependent records and hints in bounded batches.
4. **Content:** posts, threaded comments, reactions, canonical Life Updates with delivery contexts, ID-only Home feed references and backfill, Box feeds, keyset pagination, Memories, and versioned Rooms with visibility, widgets, themes, top friends, and personalization validation. Content and links must recheck canonical state, membership, blocks, moderation, and account status on read.
5. **Media and durable work:** private Storage asset lifecycle records; byte/type/size checks, Sharp processing and metadata removal; avatar, banner, post/Life Update and camera-reaction variants; same-origin authorized media routes; lifecycle epochs to prevent late republishing; durable intents, idempotent jobs, retries, repair, expiry, dead-letter handling, and object retirement.
6. **Notifications and moderation:** deduplicated ID-only activity/notification intents, same-origin SSE hints with periodic auth checks and polling fallback, reports for user/post/comment/Box, staff grants and audited actions, notices, hide/restore/suspend/unsuspend, 90-day evidence redaction, and immediate media retirement on takedown.
7. **Export and erasure:** bounded Firestore-page JSON export streamed to private Storage; authenticated `private, no-store` download streaming; password-reauthenticated deletion request/cancellation; Box ownership guard; account freeze and Auth revocation at deadline; generation-checked, resumable media/export/content/reference/Auth/account cleanup; orphan repair and fault-injection coverage.
8. **Web cutover:** all active web pages/actions use the Firebase server-only data layer; same-origin session, SSE, media, and export routes replace old URLs. CI includes emulator rules, trusted service and Functions tests, desktop and 390px browser flows, static checks, and a browser-bundle secret scan.

Start with `README.md`, `docs/development.md`, `docs/firebase/implementation.md`, `docs/firebase/collections.md`, `docs/firebase/account-lifecycle.md`, `docs/firebase/media-local.md`, `docs/firebase/parity-matrix.json`, `docs/firebase/route-crosswalk.md`, `.github/workflows/ci.yml`, `firebase.json`, `firebase.native.json`, `firebase/firestore.rules`, and `firebase/storage.rules`. Then inspect the actual implementations in `apps/web`, `packages/firebase-trusted`, and `apps/firebase-functions`. Use the docs as claims to verify, not as proof.

## Required audit

1. **Inventory and traceability.** Confirm every active web read, mutation, route handler, and scheduled job has an owning trusted service, authorization boundary, validation, failure behavior, and meaningful test. Reconcile the parity matrix with the actual web app, source tree, and old behavior reference. Flag false claims, missing flows, and dead code. Inspect collection ownership, indexes, schema versions, retention, and cleanup paths for every collection in `docs/firebase/collections.md`.
2. **Privacy and security.** Test cross-user and cross-Box access; stale membership, blocks, deleted/archived Boxes, hidden content, suspension, revoked/stale cookies, unadmitted users, direct URL guesses, SSE reconnect, CSRF/origin, media/export URLs, cache headers, and client-bundle secrets. Check Admin initialization and environment fail-closed behavior. Verify hosted deny-all rules and any local-native rule exceptions. Treat IDs and feed/notification references as pointers, never authorization. Look for existence oracles and content leaked through errors, logs, previews, or notification snapshots.
3. **Data integrity and reliability.** Review transaction boundaries, unique username/role invariants, race conditions, idempotency, queue intent recording, lease expiry, retry and dead-letter repair, partial Storage failures, orphan objects, late processing versus hide/delete, and bounded paging. Probe Box ownership transfer/removal/deletion races, feed backfill correctness, Life Update deduplication, Room stale edits, media retirement, moderation restore, export expiry, deletion generation cancellation and fault recovery. Confirm erasure removes Auth, content, references, media and export bytes, while applying the intended moderation evidence policy. Use disposable emulator fixtures only.
4. **Performance and cost shape.** Identify unbounded reads, N+1 queries, large transactions, write amplification, Storage listing, memory-heavy export/media paths, and expensive hidden-heavy feeds. Distinguish measured local behavior from hosted estimates. Add focused tests or measurements where a concrete risk exists; do not claim production cost or latency is verified locally.
5. **Web quality.** Exercise real desktop and 390px journeys, accessibility, keyboard and focus behavior, forms/errors, loading/retry states, and hydration behavior. Browser-extension errors are not automatically app defects; reproduce in a clean Playwright context before attributing them to Paldora. Confirm data and moderator views do not reveal hidden content on the next read.
6. **Documentation and operations.** `docs/operations/phase-9.md` still refers to the removed API/Supabase worker and needs a Firebase rewrite. `docs/firebase/implementation.md` still contains a sentence saying the changes are uncommitted, despite the pushed migration commit. Find and correct other stale active runbook claims while preserving clearly marked historical plans. Check clean-checkout setup and operator repair procedures. Do not erase valid open hosted gates from the tracker.

## Verification commands

Use Node 24, pnpm 11.22.0, and Java 21. Read `docs/development.md` for setup. Never point tests at a hosted Firebase project; use only `demo-paldora`. Run appropriate checks, including:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm tokens:check
pnpm firebase:parity:check
pnpm build
pnpm scan:client-bundle
pnpm firebase:rules:check
pnpm firebase:prototype:test
pnpm firebase:native:test
pnpm firebase:trusted:test
pnpm firebase:local:flow:test
pnpm firebase:web:local:test
```

The emulator commands start their own processes; avoid port conflicts with a manually running `pnpm firebase:local:dev`. On 2026-10-25 the local checks passed: 85 trusted integration tests (including a 125-record paged export), Functions flow, and 22 desktop/mobile browser checks, plus an isolated source-copy install/build/browser gate. Re-run them and report **your own** observed results, failures, environment limitations, and any flaky behavior. Add regression tests for confirmed gaps; do not write tests that merely mirror implementation.

## Boundaries and deliverable

You are authorized to inspect, test, and fix local code, tests, and docs. Do not deploy, upgrade Spark to Blaze, link a billing account, change hosted project settings/rules, enable public signup, import real user data, edit `legacy/`, or commit/push unless the user separately authorizes those steps. Leave unrelated untracked local artifacts alone. If a finding needs a product decision or hosted validation, document it and continue with independent local work.

Finish with a prioritized report: **critical/high/medium/low findings**, each with an exact file:line reference, reproduction or evidence, user/data impact, and whether fixed. Give a phase-by-phase coverage table showing the source path, tests run, pass/fail result, and residual risk. List files changed and test commands/results. Separate (a) local defects you fixed, (b) local issues still open, and (c) hosted gates that cannot be proved on Spark. Do not declare production readiness solely from emulator tests. Keep the signup gate closed until hosted IAM, task timing/retry, Storage retirement, load/cost, backup/restore, abuse, moderator operations, appeal contact, and deletion/export checks pass.
