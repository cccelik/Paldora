# Staging checklist

Ordered hosted gates before private beta and before public signup. Nothing
below has been run against a hosted project. Local emulator evidence already
exists for many behaviors (see
[Firebase implementation](../firebase/implementation.md)), but the local
suites cannot prove IAM, scheduling, billing, backup or load. Topology and
the undecided items are in [deployment](../deployment.md). Moderation and
account lifecycle runbooks are in [phase-9](phase-9.md).

Rules for using this list:

- Use disposable, provisioned test accounts. Never use production or real
  user data.
- Do not link billing, upgrade a plan, or deploy without an explicit owner
  instruction. Nothing here authorizes it.
- Provider behavior, quotas and prices change. Each item marked
  **verify against current official docs** needs a fresh check at the time.
- Record the date, commit, project ID and result next to every checked box.

## A. Before any hosted work

- [ ] Owner decides D5: where the Next.js web server runs
      ([ADR 014](../adr/014-release-topology.md) is still `proposed`).
- [ ] Owner decides the region for staging and production (the code pins
      Functions to `europe-west4`; confirm Auth, Firestore, Storage and the web
      host are compatible with it). **Verify against current official docs.**
- [ ] Owner decides whether to move off Spark (the current owner decision is
      to stay on Spark). Required for scheduled functions, the Cloud Tasks
      media queue, Cloud Storage and App Hosting per `phase-9.md` and the
      tracker. **Verify against current official docs.**
- [ ] Commit under test is on a clean checkout and passes the local gates:
      `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`,
      `pnpm tokens:check`, `pnpm firebase:parity:check`, `pnpm build`,
      `pnpm scan:client-bundle`.
- [ ] Emulator suites pass on that commit: `pnpm firebase:rules:check`,
      `pnpm firebase:prototype:test`, `pnpm firebase:trusted:test`,
      `pnpm firebase:native:test`, `pnpm firebase:local:flow:test`,
      `pnpm firebase:web:local:test`.

## B. Project setup

- [ ] Create a separate staging project and (later) a separate production
      project. Neither may share a project with `paldora-dev`.
- [ ] Add staging to `.firebaserc` with its own alias. There is no default
      alias; every deploy names its target explicitly.
- [ ] Enable only the services in use: Auth (email/password, no public signup
      path), Firestore in the chosen region, Cloud Storage (private),
      Functions. No other sign-in provider.
- [ ] Confirm Auth does not allow self-service account creation: accounts are
      created administratively and admitted by the trusted provisioning step.
      **Verify the Auth setting against current official docs.**
- [ ] Add a hosted `functions` section to a hosted Firebase config
      (`firebase.json` has none today). Never deploy with
      `firebase.native.json`.
- [ ] Confirm exactly one place sets web environment variables and that
      `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`,
      `FIREBASE_STORAGE_EMULATOR_HOST` and `FIREBASE_FUNCTIONS_EMULATOR_HOST`
      are unset on the host (the hosted web session service throws otherwise).
- [ ] Set `PALDORA_ENV` to a non-`local` value, `NEXT_PUBLIC_WEB_URL` to the
      exact HTTPS origin, `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, and
      `FIREBASE_STORAGE_BUCKET` if the bucket differs from the default.

## C. Billing, budget and alerts

- [ ] Named billing owner recorded.
- [ ] Budget created for the staging project with threshold alerts to at least
      two people before any billed service is used.
- [ ] Decide whether an automatic spend cap/shutdown is wanted. Budget alerts
      notify and do not stop spend by themselves. **Verify against current
      official docs.**
- [ ] Alerting on unexpected read, write, function-invocation and egress
      growth.
- [ ] Record the expected monthly cost for the beta cohort from section L, not
      from guesses.

## D. IAM and credentials

- [ ] Separate runtime service accounts for web, Functions, and operator
      access. None is the default compute/App Engine account if avoidable.
- [ ] Each account holds only the roles it needs (Firestore, Auth, Storage,
      Cloud Tasks enqueue/invoke for Functions as applicable). Record the
      exact role list. **Verify role names against current official docs.**
- [ ] Web server gets credentials through an attached service account or
      workload identity (it initializes Admin with only `projectId`). No
      long-lived key files.
- [ ] CI has no credentials able to deploy to production, and no cloud
      credentials at all for the validate and emulator jobs (true today:
      `.github/workflows/ci.yml` has no deploy job).
- [ ] Break-glass access is documented, logged and reviewed.
- [ ] IAM review: someone other than the author lists every principal with
      access to Firestore, Storage and Auth, and confirms no client-reachable
      path (no public bucket, no allUsers).
- [ ] Audit logging for admin data access is on for Firestore, Storage and
      IAM. **Verify availability and cost against current official docs.**

## E. Rules and index deploy

- [ ] Deploy `firebase/firestore.rules` and `firebase/storage.rules` to
      staging with `firebase.json`. Both are deny-all.
- [ ] After deploy, unauthenticated and signed-in client SDK reads and writes
      of Firestore and Storage are denied (rerun the intent of
      `pnpm firebase:rules:check` against staging with a disposable account).
- [ ] Deploy `firebase/firestore.indexes.json` and wait until every index
      reports ready before deploying code that queries it.
- [ ] Run each feed, Box, notification, Memories, Room, moderation and
      export query path once on staging and confirm there is no
      missing-index failure.
- [ ] Confirm the composite indexes for the post-detail reply query (the `in`
      query on comment parents) and the unread-count paging (document-ID
      ordering with the read filter) are ready; exercise both once with a
      disposable account.
- [ ] Confirm `firebase.native.json` / `firestore.native.rules` were never
      deployed to any hosted project.

## F. Scheduled functions, retry and dead letters

- [ ] Staging is on a plan that supports scheduled functions and the media
      task queue (see section A).
- [ ] Deploy Functions to `europe-west4` (or the decided region). All of these
      exist and are healthy: `repairAccountLifecycle`, `repairBoxDeletionJobs`,
      `repairFeedJobs`, `repairNotificationProjection`, `repairMediaJobs`
      (each every 1 minute), `redactModerationEvidence` (every 24 hours),
      `projectFeedJob`, `dispatchMediaJob`, `projectNotification`,
      `executeMediaJob`.
- [ ] Observe at least 24 hours of scheduled runs. Logs show
      `<name>.completed` events with durations, and no overlapping runs cause
      duplicate side effects (jobs use leases and epochs).
- [ ] Choose and set `maxInstances` per function from measurement. The code
      uses `1` everywhere; confirm that is sufficient for beta load or change
      it deliberately.
- [ ] Deliberate dependency outage: block Storage or Firestore access for a
      function, confirm it fails, retries, and recovers without data loss or
      duplicate delivery. Local reference: `pnpm firebase:local:flow:test`.
- [ ] Media task retries: `executeMediaJob` is configured for 5 attempts with
      10 s minimum backoff. Force a failing job and confirm it ends in the
      durable `dead` state, then replay it by a hosted-safe operator path.
      (The only replay command today, `pnpm firebase:media-repair:local`, is
      emulator-only; a hosted operator path is an open gate.)
- [ ] Alert on any `*.failed` event, on jobs stuck in `pending`/`dead`, and on
      a scheduled function that has not logged a completion for more than a few
      intervals.
- [ ] Confirm trigger behavior when a Firestore trigger is delivered more than
      once (at-least-once is assumed; **verify against current official
      docs**). Handlers are expected to be idempotent.

## G. Storage and retirement

- [ ] Bucket is private, in the chosen location, with uniform bucket-level
      access, no public access, and deny-all Storage rules.
      **Verify settings against current official docs.**
- [ ] Upload a photo, avatar, Room banner and camera reaction; confirm they
      process into derivatives and the raw upload is removed.
- [ ] Reads go only through the same-origin web route and return
      `private, no-store`; no download URL or object path reaches the browser.
- [ ] Retire each object kind (replace avatar, delete post, delete Life
      Update, remove Box, moderator takedown, account deletion) and confirm
      the object is gone from the bucket and the next read returns not-found.
- [ ] A previously issued media URL fails after takedown.
- [ ] Orphan sweep: an unattached upload expires and is removed
      (`repairMediaJobs` handles `expireUnattached`).
- [ ] Decide on object versioning/soft delete and retention for the bucket in
      light of deletion promises; document it. **Verify against current
      official docs.**

## H. Rate limits and abuse

- [ ] Per-account limits (Firestore fixed windows in `NativeRateLimits`) return
      the generic "try again later" error at the boundary on staging. Local
      reference: `packages/firebase-trusted/src/native-rate-limits.integration.test.ts`.
- [ ] Rate-limit storage failure fails closed (the call is rejected). Verify
      with a deliberate Firestore error.
- [ ] Measure rate-limit document read/write cost and contention under
      concurrent use. Decide on expiry cleanup of old window documents
      (`expiresAt` is stored; no cleanup policy is recorded).
- [ ] Add edge/IP controls for sign-in, password reset, and other
      unauthenticated or auth-adjacent endpoints; none exist in the
      repository. Decide where they live (D5).
- [ ] Sign-in, password-reset, username-availability and invitation flows do
      not reveal whether an account exists.
- [ ] Guessed IDs, blocked users (both directions), former members, archived
      Boxes and deleted content return the same not-found as absent content on
      staging. Local reference: the `*.integration.test.ts` files in
      `packages/firebase-trusted/src`.

## I. Sessions

- [ ] Session cookie `paldora_session` is `HttpOnly`, `Secure`, `SameSite`,
      scoped to the exact origin, with a 7-day lifetime. Confirm in a real
      browser on staging.
- [ ] Password change and email-link reset rotate the session epoch and the
      old cookie is rejected. Local reference: Phase 2 browser tests.
- [ ] Suspension ends web access and streams within the SSE window (checks
      every five seconds, stream lifetime 45 seconds).
- [ ] Account deletion revokes Auth sessions and denies access during cleanup.
- [ ] Cross-origin Server Action posts are rejected (origin must equal
      `NEXT_PUBLIC_WEB_URL`).
- [ ] Session revocation test: revoke a user's refresh tokens and confirm the
      cookie stops working on the next request.
      **Verify revocation semantics against current official docs.**

## J. Headers, CSP and client bundle

- [ ] A production response carries exactly one `Content-Security-Policy`
      header from `apps/web/proxy.ts` (nonce-based, `frame-ancestors 'none'`,
      `object-src 'none'`, `connect-src 'self'`) with no `unsafe-inline`
      scripts. Local reference: `apps/web/app/lib/security/csp.test.ts`.
- [ ] Other headers present: `Strict-Transport-Security` (sent whenever
      `PALDORA_ENV` is not `local`), `X-Content-Type-Options`,
      `X-Frame-Options: DENY`, `Referrer-Policy`,
      `Cross-Origin-Opener-Policy`, and `Permissions-Policy` allowing camera for
      self only. Local reference: `security-headers.test.ts`.
- [ ] The host or CDN does not add a second CSP or strip these headers.
- [ ] TLS is valid for the exact origin; HTTP redirects to HTTPS.
- [ ] `pnpm scan:client-bundle` passes on the exact staging build, and a
      manual search of served JS for service-account identifiers and the web API
      key marker is clean.
- [ ] Desktop and 390px browser suite passes against a staging-shaped build:
      `pnpm firebase:web:local:test` (emulator-only today; a staging run needs
      a hosted-safe variant of the seed and test config).

## K. Logging and alerting

- [ ] Structured logs from web and Functions reach a central place with a
      defined retention. **Verify retention and cost against current
      official docs.**
- [ ] Spot check: no private bodies, tokens, cookies, passwords, signed URLs
      or image data appear in logs.
- [ ] Alerts: function errors, scheduled function silence, web 5xx rate,
      auth failure spikes, budget thresholds, and Firestore/Storage error
      rates.
- [ ] Alert routing reaches a named on-call person and is tested with a
      synthetic alert.
- [ ] Request or job correlation exists for each alert so an operator can
      trace a failure without reading private content.

## L. Load and cost measurement

- [ ] Seed disposable fixtures (target sizes agreed with the owner; the
      tracker mentions 10k and 100k posts) in staging.
- [ ] Record Firestore document reads per page for: Box feed, Home feed (with
      more than 30 Box memberships), notification list and unread count,
      comments, Memories month page, Room preview, member list, friend list,
      and moderation queue. Compare with the provisional budget of about 200
      candidate reads and 10 queries for a typical page; record the real
      figure and decide.
- [ ] Hidden-heavy and block-heavy cases (many hidden or blocked items) still
      return a full page within a bounded read count.
- [ ] SSE: reads per open stream per minute (a five-second account check
      implies a recurring read); multiply by expected concurrent users.
- [ ] Write cost per post, comment, reaction, Life Update delivery
      (many-Box), Box deletion, account export and account deletion.
- [ ] Measure p50/p95 latency for each page and callable, plus cold start for
      the web host and for Functions.
- [ ] Functions throughput with the chosen `maxInstances`: media processing
      per minute, feed projection lag, notification projection lag, Box
      deletion cleanup time for a large Box (large-scale cleanup throughput is
      listed as an open gate).
- [ ] Project monthly cost for a defined beta cohort. Prices and free quotas
      are **to be verified against current official docs**, not assumed.
- [ ] Record and review hot-document contention (rate-limit counters, Box
      documents, Box-membership counters).
- [ ] Hot-post write latency (ADR 022): every comment and reaction also
      writes the post document. Emulator: 80 simultaneous operations on one
      post serialize to about 76 s with 0 aborts at 30 attempts. Measure real
      p50/p95/abort rate with 20, 50 and 80 concurrent writers and confirm
      `readOnly` transactions behave as expected hosted.
- [ ] Interaction index rollout: run the backfill, confirm
      `interaction-index check` reports no drift, then enable
      `PALDORA_TRUST_INTERACTION_INDEX=1` on staging and re-record reads per
      page (Box feed target about 56 per 20 posts, against about 196 when
      the index is missing). Confirm a lost index re-arms its repair job
      after the 10 minute cooldown.

## M. Backup and restore drill

- [ ] Decide the Firestore protection method (managed export, scheduled
      backups, point-in-time recovery). **Verify availability, retention and
      cost against current official docs.**
- [ ] Take a backup of staging with disposable data.
- [ ] Restore into a separate scratch project or database, then boot the web
      app against it and confirm accounts, Boxes, posts and notifications read
      correctly.
- [ ] Confirm what a restore does to deleted-account and deleted-content
      state (restored data must not resurrect content that was promised
      deleted; document the re-application procedure for deletions made after
      the backup).
- [ ] Storage: decide how objects are protected (versioning, soft delete,
      copies) and restore one object kind end to end, including derivatives.
- [ ] Auth: document how users are recovered after a loss (export of Auth
      users and re-admission). **Verify against current official docs.**
- [ ] Record the recovery time and data-loss window achieved.

## N. Moderator operations

- [ ] A hosted, audited path to grant and revoke staff exists. Today
      `pnpm firebase:staff:local` is emulator-only and refuses to run against
      anything but `demo-paldora`. Build and review the hosted path first.
- [ ] Moderator account holds an active `nativeStaffGrants/{uid}` document and
      an active account; both are checked in each moderation transaction.
- [ ] Staffing and coverage plan: who reviews the queue, within what time,
      and who covers absences. Owner signs off.
- [ ] End-to-end on staging with disposable accounts: a blocked or
      unauthorized reporter cannot identify a target; a moderator processes a
      case with a complete audit trail; hide, restore, suspend and unsuspend
      behave; the author sees a content notice without reporter or evidence.
- [ ] A takedown retires media before success is reported, and fails and
      retries cleanly if Storage is down.
- [ ] `redactModerationEvidence` removes closed-case evidence after 90 days
      (use a controlled clock or fixture) and keeps pointers for active
      enforcement.
- [ ] Audit rows are never deleted by hand.

## O. Appeal contact

- [ ] Owner creates and tests the external appeal/moderation email address
      (currently unset).
- [ ] The address is shown only after it works; an unset address is not
      presented as an appeal channel.
- [ ] Response-time expectation and an owner for the inbox are defined.
- [ ] Private beta: the invitation contact remains the review path until the
      approved address exists (`phase-9.md`).

## P. Deletion and export end to end

- [ ] Request a `paldora-json-v1` export on staging; it is built by
      `repairAccountLifecycle`, is private, downloads only for the owner through
      `/settings/account/download` with `private, no-store`, and expires after
      seven days.
- [ ] Export contains media metadata, not media bytes, and nothing about
      other users beyond what the owner is entitled to see.
- [ ] Deletion request requires password reauthentication and prior transfer
      of every owned Box (a request in `blocked` shows this).
- [ ] Deletion can be cancelled before the seven-day deadline with the
      password and is rejected at or after it.
- [ ] After the deadline the account moves to `deleting`, sessions are
      revoked, access is denied, and cleanup removes media and export objects,
      content and references, the Auth user and finally the account records.
- [ ] A deliberate Storage/Auth/Firestore outage during `deleting` retries
      and then completes without hand-marking completion.
- [ ] Stale-run protection: a cancelled or re-requested deletion cannot be
      completed by an old run (generation checks).
- [ ] Local references: `native-account-lifecycle.integration.test.ts` and
      the Phase 7 browser tests.

## Q. Private beta go/no-go

All of the following are checked, with evidence recorded:

- [ ] Sections A to K and N to P above.
- [ ] Section L measured and the cost accepted by the owner.
- [ ] Section M drill completed at least once.
- [ ] Beta invitees are provisioned administratively; the registration route
      is absent or disabled.
- [ ] Owner gives explicit approval to deploy and (if needed) to enable
      billing.

## R. Signup stays closed until

Public signup must not be activated until **all** of these are true and the
owner makes a separate, explicit decision:

- [ ] Every item in sections A to Q is complete on production-equivalent
      infrastructure, not only on the emulators.
- [ ] Moderation staffing and an on-call or response rota exist, and the
      external appeal address is live and monitored.
- [ ] A hosted, audited staff grant path exists and has been reviewed.
- [ ] Reporting, takedown, suspension, export and deletion have passed the
      hosted privacy and abuse smoke list in `phase-9.md`.
- [ ] Edge and per-account abuse controls cover registration, sign-in,
      password reset and every abuse-sensitive write, with measured behavior
      under attack-shaped load.
- [ ] A restore drill and an IAM review are complete, and alerts are routed
      to people who will act on them.
- [ ] Cost under expected public load is measured and a budget with alerts
      is in place.
- [ ] Legal and policy documents the owner requires (terms, privacy notice,
      data processing and retention statements) are published. This repository
      contains no such decision; the owner must define them.
- [ ] A signup design exists (verification, abuse resistance, invitation or
      open) and has been security reviewed. None exists today.
- [ ] Owner approval is recorded in `docs/rebuild-plan.md` or an ADR.
