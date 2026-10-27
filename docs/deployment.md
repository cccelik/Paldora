# Deployment

This document describes how Paldora is meant to be deployed on Firebase and
what is and is not decided. **No hosted environment is deployed.** The only
Firebase project that exists is `paldora-dev` (`.firebaserc` alias `dev`). It
is on the Spark plan, its Firestore database is in `europe-west4`, and its
Firestore rules are deploy-verified as deny-all. No Storage bucket, Auth
sign-in provider, Functions, web host, staging project or production project
has been enabled there
([Firebase implementation](firebase/implementation.md), "Current
implementation notes"). Public signup stays disabled.

Everything about hosted behavior below is either read from files in this
repository or marked **verify against current official docs**. The retired
NestJS/PostgreSQL/Supabase/Redis stack is reference material in `legacy/` only.

The checkable pre-beta and pre-signup gates are in
[staging checklist](operations/staging-checklist.md). Moderation and account
lifecycle operations are in [Phase 9 operations](operations/phase-9.md).

## Topology

```text
Browser ──HTTPS──> Next.js web server (apps/web)
                     │  server-only, Firebase Admin SDK via @paldora/firebase-trusted
                     ├─> Firebase Auth      (email/password, 7-day session cookie `paldora_session`)
                     ├─> Firestore          (canonical data, `native*` collections)
                     └─> Cloud Storage      (private objects, served only through web routes)

Firestore ──> Cloud Functions v2 (apps/firebase-functions, europe-west4)
              triggers, scheduled repair, Cloud Tasks media queue, callables
```

- The browser never talks to Firestore, Storage or Auth data APIs. Firestore
  and Storage client rules are deny-all (`firebase/firestore.rules`,
  `firebase/storage.rules`). Authorization is enforced by the trusted
  services, which run with Admin credentials that bypass rules.
- The web server verifies the session cookie on each request, rechecks account
  state, and calls `@paldora/firebase-trusted`. Media and export downloads are
  same-origin web routes that re-authorize every read and return
  `private, no-store`; no Firebase download URL is issued.
- Functions own durable and retryable work: feed and notification projection,
  media processing and retirement, Box deletion, account export and deletion
  repair, and moderation evidence redaction. Firestore documents are the
  durable intent; a Functions trigger or schedule only advances them.
- Region: every Function in `apps/firebase-functions/src/index.ts` is pinned
  to `europe-west4` with `maxInstances: 1`, and the media Cloud Tasks queue is
  addressed as `locations/europe-west4/functions/executeMediaJob`. The
  Firestore database in `paldora-dev` is also `europe-west4`. **Decided
  2026-10-27:** `europe-west4` for staging and production
  ([ADR 023](adr/023-web-hosting-app-hosting.md)). App Hosting lists
  `europe-west4` as a backend location (checked 2026-10-27; **verify against
  current official docs** before creating the backend).
- Node 24 for the workspace (`.nvmrc`) and for Functions
  (`apps/firebase-functions/package.json` `engines.node: "24"`). Whether Node
  24 is a supported Cloud Functions runtime on the hosting date: **verify
  against current official docs**.

## What is deployed where

| Component                   | Source                                                           | Target                       | State today                                              |
| --------------------------- | ---------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| Firestore rules             | `firebase/firestore.rules` (via `firebase.json`)                 | Hosted Firestore             | Deny-all deployed to `paldora-dev`                       |
| Firestore indexes           | `firebase/firestore.indexes.json` (31 `collectionGroup` entries) | Hosted Firestore             | Hosted deployment of this file is not recorded           |
| Storage rules               | `firebase/storage.rules` (deny-all)                              | Cloud Storage                | No bucket enabled                                        |
| Cloud Functions             | `apps/firebase-functions`                                        | Functions v2, `europe-west4` | Not deployed                                             |
| Web server                  | `apps/web` (Next.js 16) with `apps/web/apphosting*.yaml`         | Firebase App Hosting (D5)    | Config committed; not deployed                           |
| Native rules (not deployed) | `firebase/firestore.native.rules` via `firebase.native.json`     | Local emulators only         | Direct-client prototype; hosted rules must stay deny-all |

Notes grounded in the config files:

- `firebase.json` is the hosted config: deny-all Firestore and Storage rules,
  the shared indexes file, a `functions` block (source
  `apps/firebase-functions`, codebase `paldora`, runtime `nodejs24`, predeploy
  build) and emulator ports. The runtime value follows `engines.node: "24"`;
  the Firebase Functions docs page last read listed only Node 22 and 20, while
  Google Cloud runtime pages list `nodejs24` (some locales as preview):
  **verify against current official docs**, and fall back to `nodejs22` in
  both places if the CLI rejects it. **Known gap:** `@paldora/firebase-trusted`
  is a `workspace:*` dependency, which Cloud Build cannot resolve from the
  `apps/firebase-functions` source alone; a packaging step (for example
  `pnpm deploy` output or bundling) is unresolved and must be solved before the
  first Functions deploy. `pnpm hosted:check` guards this config.
- `firebase.native.json` is the local config used by every emulator script
  (`--config firebase.native.json`). It points at the permissive
  `firestore.native.rules` and declares the Functions source
  `apps/firebase-functions` with codebase name `native-local`. **Never deploy
  with `firebase.native.json`**; it would replace deny-all rules with the
  direct-client prototype rules.
- Web build and start: `pnpm turbo run build --filter=@paldora/web...` and
  `pnpm --filter @paldora/web start` (`next start` per `apps/web/package.json`;
  whether the chosen host uses it is part of D5).
- There is no `.firebaserc` entry for staging or production. Create the alias
  locally with `firebase use --add` after the project exists; never commit an
  invented id.

### Deployed Functions

All use `region: 'europe-west4'` and `maxInstances: 1`.

| Kind                 | Names                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduled (1 min)    | `repairAccountLifecycle`, `repairBoxDeletionJobs`, `repairFeedJobs`, `repairNotificationProjection`, `repairMediaJobs`                                                                                                                                                                                                                         |
| Scheduled (24 h)     | `redactModerationEvidence`                                                                                                                                                                                                                                                                                                                     |
| Firestore triggers   | `projectFeedJob` and `dispatchMediaJob` (both on `nativeJobs/{jobId}`), `projectNotification` (on `nativeActivity/{activityId}`)                                                                                                                                                                                                               |
| Task queue           | `executeMediaJob` (`retryConfig`: `maxAttempts: 5`, `minBackoffSeconds: 10`)                                                                                                                                                                                                                                                                   |
| Callables (`onCall`) | Box deletion, Life Updates, invitations, friendships, usernames, Box posts/comments/reactions, blocks, reports, moderation list/hide, and account provisioning. Each requires Auth and consumes a per-account hourly rate limit. No call site in `apps/web/app` uses them; they serve the local Functions flow tests and the native prototype. |

`maxInstances: 1` bounds concurrency and cost but also bounds throughput. It
is a deliberate local default, not a measured production value; throughput
and cost are an open staging gate.

## Environments

| Environment | Firebase project                | Plan  | Purpose and rules                                                                                                                                                          |
| ----------- | ------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local       | `demo-paldora` (emulators only) | none  | `PALDORA_ENV=local`. Auth 9099, Firestore 8080, Storage 9199, Functions 5001, Pub/Sub 8085. Never point local work at a hosted project. CI uses the same project.          |
| Development | `paldora-dev` (alias `dev`)     | Spark | Controlled hosted checks only. Deny-all Firestore rules. The owner chose to keep it on Spark (2026-10-22); do not link billing or upgrade without a new owner instruction. |
| Staging     | not created                     | n/a   | Required before private beta. Must be a separate project with a named billing owner, budget and alerts.                                                                    |
| Production  | not created                     | n/a   | Separate project. Requires everything in the staging checklist, then a separate owner decision for signup.                                                                 |

Environment safety is enforced in code
(`apps/web/app/lib/server/environment.ts`, called from
`apps/web/app/lib/server/firebase/session.ts`). `PALDORA_ENV` must be exactly
`local`, `staging` or `production`; a missing or misspelled value **fails
closed** at the first request that needs Firebase. With `local`, the session
service insists on project `demo-paldora` and the four exact emulator host
values. With `staging` or `production`, it refuses to run if any emulator host
variable is set, if `NEXT_PUBLIC_WEB_URL` is not HTTPS, if `FIREBASE_PROJECT_ID`
is missing or starts with `demo-`, or if `FIREBASE_WEB_API_KEY` is missing or
looks like a demo or `dev_only` credential. `next build` does not require
`PALDORA_ENV`, so CI builds are unaffected. This is unit tested
(`environment.test.ts`) but has not been exercised against a hosted project. Origin checks on
Server Actions are looser only in `local`
(`apps/web/app/lib/server/firebase/origin.ts`), and the HSTS header is sent
whenever `PALDORA_ENV` is not `local` (`apps/web/next.config.ts`).

## Environment variables

Names only; values live in the owning secret store or the untracked `.env`
(never read or print it). The authoritative list for local use is
`.env.example`.

| Variable                                                                                                                       | Used by                 | Visibility                        | Notes                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PALDORA_ENV`                                                                                                                  | web                     | server                            | `local` for emulators; hosted values are `staging` and `production` (set in `apphosting.<env>.yaml`; `pnpm hosted:check` enforces them in committed files, and the web app fails closed on any other value).                                                                                            |
| `FIREBASE_PROJECT_ID`                                                                                                          | web                     | **server-only**                   | Required. `demo-paldora` locally.                                                                                                                                                                                                                                                                       |
| `FIREBASE_WEB_API_KEY`                                                                                                         | web                     | **server-only**                   | Required. Used server-side for the Auth REST sign-in. The client-bundle scan treats it as a forbidden marker, so it must not reach the browser.                                                                                                                                                         |
| `FIREBASE_STORAGE_BUCKET`                                                                                                      | web, Functions          | **server-only**                   | Optional; defaults to `<project>.firebasestorage.app`. Set it if the bucket differs.                                                                                                                                                                                                                    |
| `NEXT_PUBLIC_WEB_URL`                                                                                                          | web                     | public                            | Required. `publicEnvironment()` accepts only HTTP or HTTPS and strips a trailing slash. It must be the exact HTTPS origin in hosted environments because action origin checks compare against it.                                                                                                       |
| `LOG_LEVEL`                                                                                                                    | web                     | server                            | Listed in `.env.example`.                                                                                                                                                                                                                                                                               |
| `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`, `FIREBASE_FUNCTIONS_EMULATOR_HOST` | web, Functions, scripts | server, **local only**            | Must be **unset** in hosted environments; the hosted web session service throws if any is set.                                                                                                                                                                                                          |
| `GCLOUD_PROJECT` / `GCP_PROJECT`, `FUNCTIONS_EMULATOR`                                                                         | Functions               | provided by the Functions runtime | Functions derive the default bucket from these. Do not set by hand in hosted environments.                                                                                                                                                                                                              |
| Admin credentials                                                                                                              | web, Functions          | **server-only**                   | The web server calls `initializeApp({ projectId })`, so it relies on Application Default Credentials. How the chosen web host supplies them (attached service account, workload identity, or a key) is undecided. Prefer an attached least-privilege service account; do not mint long-lived key files. |

Rules:

- Only `NEXT_PUBLIC_*` values may reach the browser. `pnpm scan:client-bundle`
  (`scripts/scan-client-bundle.mjs`) fails the build if built browser assets
  contain credential markers such as `GOOGLE_APPLICATION_CREDENTIALS`,
  `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_WEB_API_KEY`,
  `FIREBASE_STORAGE_BUCKET`, `firebase-admin` or `nativeAccounts`.
- Supabase, database, Redis and S3 variables no longer exist in the active
  workspace.

## Secrets handling

- No secret is committed. `.env` is local-only and untracked; `.env.example`
  holds only emulator placeholders.
- Hosted secrets belong in a managed secret store attached to the runtime, not
  in the repository, CI logs or client bundles. The planned store was Secret
  Manager ("Configure Secret Manager, separate service accounts" in the
  Phase 1 tracker); the web host's secret mechanism depends on D5.
- Use separate service accounts for web, Functions, and any operator/CI
  identity. CI must not hold credentials able to deploy to production
  (stated in the Phase 1 tracker). The current CI workflow
  (`.github/workflows/ci.yml`) only builds and runs emulator suites against
  `demo-paldora`; it has no deploy job and no cloud credentials.
- Never log tokens, cookies, signed URLs, private bodies or image data.
  Functions log through `logEvent` and `observedJob`, which record job name,
  job ID and duration only.

## Release order

The principle is unchanged: verify, ship backward-compatible data-layer
changes, then code, then smoke test, and clean up later.

1. **Verify.** Run the standard gates on the commit to be released:
   `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`,
   `pnpm tokens:check`, `pnpm firebase:parity:check`, `pnpm hosted:check`, `pnpm build`,
   `pnpm scan:client-bundle`, and the emulator suites
   (`pnpm firebase:rules:check`, `pnpm firebase:trusted:test`,
   `pnpm firebase:native:test`, `pnpm firebase:local:flow:test`,
   `pnpm firebase:web:local:test`). Take a Firestore backup point first
   (export or point-in-time recovery; **verify against current official
   docs** for availability and retention on the chosen edition).
2. **Backward-compatible data layer.**
   - Deploy `firebase/firestore.rules` (deny-all) and
     `firebase/storage.rules` (deny-all) using `firebase.json`. Deny-all rules
     must never be loosened as part of a release.
   - Deploy `firebase/firestore.indexes.json` **and wait for every new index
     to finish building** before shipping code that queries it. Additive
     indexes only; removing an index is a later cleanup release. Index build
     time and the failure mode of a query with a missing index are provider
     behaviors: **verify against current official docs**.
   - Schema changes are additive and versioned (documents carry a schema
     version, for example `paldora-json-v1` and "Schema v1" reports). Old code
     must tolerate new fields and new code must tolerate old documents.
3. **Functions.** Deploy before web so triggers and scheduled repairs exist
   for any new job type the web will create. Deploy to the target project
   explicitly, not by alias default (`firebase.json` now has the `functions`
   block; see the packaging gap above).
4. **Web.** Roll out the App Hosting backend (root directory `apps/web`). Sessions are 7-day cookies verified
   server-side, so a web rollout does not need to sign people out.
5. **Smoke test** (disposable provisioned accounts only): sign in, create a
   Box, post, upload and read a photo, check a notification, confirm a
   non-member gets not-found, confirm one `Content-Security-Policy` header,
   confirm scheduled functions logged `*.completed`, and confirm direct client
   access to Firestore and Storage is denied.
6. **Later cleanup** (a separate release): remove obsolete indexes, fields and
   code only after a reconciliation window.

## Rules and indexes

- **Application-data rules are deny-all** on both Firestore and Storage:
  `allow read, write: if false` on `/{document=**}` and `/{object=**}`. All
  access is Admin SDK, authorized by IAM, not by rules.
- `firestore.native.rules` is a local direct-client prototype. It is used only
  with `firebase.native.json` on emulators. Hosted rules stay deny-all until a
  future decision and security review say otherwise.
- `pnpm firebase:rules:check` verifies that the hosted rule files deny
  anonymous and signed-in access in the emulator. Run it before any rules
  deploy.
- Indexes live in one shared file used by both configs. Treat adding an index
  like adding a migration: reviewed, additive, deployed first.

## Blaze and Spark

- `paldora-dev` is on Spark by owner decision. The repository states that
  scheduled functions need Blaze (`docs/operations/phase-9.md`:
  "Scheduled functions need Blaze, so none of the schedules above are proven
  hosted"), and that App Hosting and Cloud Storage for Firebase need a linked
  billing account (Firebase implementation notes).
- What Spark therefore cannot validate here: scheduled repair functions, the
  media task queue and its retry timing, object retirement in a real bucket,
  account export/deletion end to end, App Hosting, hosted IAM behavior, and
  realistic cost and load.
- What Spark can do: hold the deny-all Firestore rules, run limited Firestore
  query and index checks within free quota, and nothing else the repository
  relies on.
- Exact quotas, free tiers, prices and plan requirements change. **Verify
  against current official docs** before making any cost claim. Blaze is a
  pay-as-you-go plan; the repository records no budget figure.
- Do not link billing or upgrade a project without an explicit owner
  instruction. A budget with alerts must exist before billing is enabled
  (see the checklist). Budget alerts notify, and do not by themselves stop
  spend; **verify against current official docs** for any automatic cap.

## Rollback per component

| Component       | Rollback                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web             | Redeploy the previous build. Sessions stay valid because they are server-verified cookies. If a rollout changed the `paldora_session` handling, say so in the release notes. Mechanism depends on D5.                                                                                 |
| Functions       | Redeploy the previous source. Jobs are durable Firestore intents with leases, epochs and generation checks, so a re-run is safe. Retry/replay for dead media jobs is the operator path described in `docs/firebase/media-local.md` (local only today).                                |
| Firestore rules | Redeploy the previous rules file. The safe fallback is always deny-all, which is the committed state.                                                                                                                                                                                 |
| Indexes         | Additive indexes need no rollback; leave them. Removal is a later release.                                                                                                                                                                                                            |
| Data            | Forward-fix with additive, versioned changes. Restore from a backup only through the tested restore drill (a checklist gate); no restore has been rehearsed. Account deletion and export are irreversible past their deadlines, so do not roll back across a deletion without a plan. |
| Storage         | Retired objects are deleted, not versioned. Whether object versioning or soft delete is enabled is not decided; **verify against current official docs** and decide in the backup drill.                                                                                              |

## Not yet decided or unverified

Decided nothing here should be treated as settled:

- **D5, web hosting: decided** (Firebase App Hosting, `europe-west4`;
  [ADR 023](adr/023-web-hosting-app-hosting.md)). It needs Blaze billing, and
  [ADR 014](adr/014-release-topology.md) is still `proposed`. Unverified: pnpm
  and Node 24 support in the App Hosting build, cold starts, rollout and
  rollback mechanics, and custom-domain TLS. Bring-up steps are in
  [staging bring-up](operations/staging-bringup.md); web config is
  `apps/web/apphosting.yaml` plus `apphosting.staging.yaml` and
  `apphosting.production.yaml` (checked by `pnpm hosted:check`).
- **Moderator and appeal email.** No external appeal or moderation address is
  set. During private beta the invitation contact is the review path; do not
  present an unset address as a working appeal channel.
- **Hosted moderator grant path.** The first administrator is granted by the
  owner-run, flagged and alarmed break-glass script `pnpm firebase:staff:hosted`
  ([ADR 020](adr/020-hosted-staff-grants.md)); the private `staff-grants`
  service is not built. Neither has run against a hosted project.
- **Billing owner, budgets, alerts, staging and production projects.**
- **Hosted Functions config**, including per-function instance limits,
  retries and dead-letter handling for scheduled functions, and whether
  `maxInstances: 1` is acceptable.
- **Rate limits are Firestore fixed windows per account and action.** Edge/IP
  controls, expiry cleanup of rate-limit documents, and hosted contention and
  cost are open (tracker, Phase 0 notes). No automatic TTL policy is recorded.
- **Backup and restore.** No backup, PITR or restore drill has been performed.
- **Unverified provider facts** (check current official docs for each): Node 24
  runtime support in Functions; Cloud Tasks queue defaults and per-region
  availability for task-queue functions; scheduled-function minimum interval,
  retry and timeout behavior; Firestore index build behavior; PITR and export
  features and retention; Storage bucket location rules; App Hosting
  availability in `europe-west4`; free-tier quotas and pricing.
- **Real data.** The tracker lists "confirm whether any real data exists" as
  open; if real data ever exists, a rehearsed migration with reconciliation
  and write freeze is needed. Never dual-write without a designed protocol.

## Production requirements (target)

- Separate staging and production projects with a named billing owner,
  budget and alerts.
- Least-privilege service accounts for web, Functions and operators; no
  long-lived keys.
- Firestore backups with a tested restore, and a decision on Storage
  protection.
- Scheduled functions proven on Blaze with alerting on `*.failed` log events.
- Logs, metrics and alerts that carry no private content.
- TLS on the exact `NEXT_PUBLIC_WEB_URL` origin, one nonce CSP from
  `apps/web/proxy.ts`, and the security headers from
  `apps/web/app/lib/security/security-headers.ts`.
- Public signup remains closed until the Phase 9 gate and the owner's
  separate decision.
