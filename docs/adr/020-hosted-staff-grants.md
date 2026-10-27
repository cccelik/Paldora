# ADR 020: Hosted staff grants

Status: Proposed. Waits on D5 (hosted project and Blaze billing). Nothing here
has been built or run against a hosted project.

## Context

[ADR 019](019-moderation-authority-and-audit.md) makes staff authority an
explicit grant (`nativeStaffGrants/{uid}`) assigned only by an operator command.
Today the only such command, `pnpm firebase:staff:local`
(`packages/firebase-trusted/scripts/staff-grant.mjs`), refuses to run unless it
targets the disposable emulator (`GCLOUD_PROJECT=demo-paldora`,
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, no credentials). Its `--operator`
value is a free-text label matching `/^[a-z0-9._-]{1,40}$/`, so the audit row
(`staff.grant`/`staff.revoke` in `nativeModerationAudit`) records an
unverifiable claim. That is correct for disposable data and wrong for a hosted
project. Hosted moderation therefore has no way to create its first
moderator, and the obvious shortcuts (a console edit, a service-account key on
a laptop, a public callable, a role derived from a claim) would bypass the
audit trail ADR 019 promises.

Fixed facts: `firebase/firestore.rules` is deny-all, so all grant writes are
Admin SDK writes governed by IAM, not rules. `staff()` in
`native-moderation.ts` rechecks both the account (`active`) and the grant
(`active`) inside every moderation transaction. Revocation keeps the document
with `status: revoked`. Staff-grant audit rows have no `reportId`, so the
90-day redaction job does not select them.

## Decision

### Who may grant

- The actor is a **human operator identified by Google Cloud IAM**, never a
  Paldora app account. App accounts, Box roles, email domains and Auth claims
  grant nothing.
- Grants go through one **private Cloud Run service**, `staff-grants`, deployed
  without `allUnauthenticated`. Operators hold `roles/run.invoker` on that
  service only, granted to a named Google group (or, while the team is one
  person, to that person directly). It is not a callable function, not part of
  the web app, and not reachable from browsers or the mobile apps.
- The service runs as a dedicated service account, `staff-grants-sa`, which
  holds only Firestore read/write access in the project. It has no Auth,
  Storage, Secret write, or IAM admin role. The web and Functions runtime
  accounts get no invoker permission on it, and `staff-grants-sa` gets no
  permission to invoke anything.
- `max-instances=1`, `concurrency=1`, ingress `all` with IAM required (internal
  ingress would block operator laptops; IAM is the gate).
- The service exposes three operations: `propose`, `approve`, `revoke`. It
  never lists accounts and never accepts an email, only a Firebase Auth UID.

### Operator identity in the audit row

- The request carries a Google-signed ID token (`gcloud auth print-identity-token
--audiences=<service URL>`). Cloud Run checks it at the edge, but the service
  **re-verifies** signature, issuer, expiry and audience with
  `google-auth-library` before trusting any claim, and rejects tokens without a
  stable `sub`.
- The audit row stores `operatorRef` and `operatorKeyVersion`, not the email
  and not the raw `sub`. `operatorRef = hex(HMAC-SHA256(key, "operator:" + sub))`
  truncated to 32 hex characters. The key lives in Secret Manager and is
  readable only by `staff-grants-sa`. HMAC prevents enumerating numeric `sub`
  values back to rows. Rotation bumps `operatorKeyVersion`; old rows stay
  attributable by the retained key version.
- The authoritative, human-readable identity is the **Cloud Audit Log** entry
  for the invocation (principal email, time, caller IP), which stays in
  Google's log system and not in application data. The row carries the Cloud
  Run `requestId` (`X-Cloud-Trace-Context` trace ID) so an investigator can
  join the two. The app audit therefore never holds an email, and the
  `--operator` free-text flag does not exist in the hosted path.
- The core methods change from `operator: string` to an `OperatorIdentity`
  discriminated union: `{ kind: 'emulator-label', label }` or
  `{ kind: 'iam', ref, keyVersion, traceId }`. The `iam` kind is constructible
  only inside the hosted service module. The label kind is accepted only when
  `FIRESTORE_EMULATOR_HOST` is set and `K_SERVICE` is not.
- Each request must include a `reason` (20 to 200 characters, rejected if it
  contains an email-shaped string, matching the existing case-action rule) and
  a client UUID `idempotencyKey`, used as the audit document ID so a retry
  returns the original result.

### Two-person rule and first administrator

- **Administrator grants need two distinct operators.** `propose` writes
  `nativeStaffGrantProposals/{id}` (target UID, role, `proposerRef`, reason,
  `expiresAt` = 24 hours) and an audit row `staff.grant.proposed`. `approve`
  must come from a different `operatorRef` and applies the grant and writes
  `staff.grant` in one transaction, with `approverRef`. Proposals are
  single-use, deleted on apply, and expire.
- **Moderator grants and all revokes need one operator.** A revoke is the
  safety action and must not wait for a second person.
- **First administrator (bootstrap).** There is no second operator yet. The
  documented break-glass path is: the project owner temporarily grants
  `roles/run.invoker` to a second, separately held identity (own hardware key),
  both run propose and approve, and the second binding is removed immediately.
  The audit row carries `breakGlass: true` whenever proposer and approver were
  not both in the standing operator group, and a page-level alert fires (below).
  If the project has only one human, this is a weak control and is recorded as
  such. **Owner decision (2026-10-27):** a single-operator first grant, always
  flagged `breakGlass` and alarmed, is acceptable for the bootstrap. The
  two-person rule applies as soon as a second operator exists.
- A target must be an existing, `active` `nativeAccounts` account. The service
  refuses to revoke the last active administrator unless `breakGlass` applies.

### Writes and rules

- Only the service writes `nativeStaffGrants`, `nativeStaffGrantProposals` and
  the staff audit rows, through the Admin SDK in one transaction each
  (`tx.create` for audit, never update or delete). `firestore.rules` stays
  deny-all with no new `match` block. Nothing new is added to `firebase.json`
  rules; the service is deployed separately from Functions and Hosting.
- Each audit row is also emitted as a structured Cloud Logging entry
  (`action`, `operatorRef`, `targetUid`, `role`, `traceId`; never the reason
  text) into a log bucket with a locked retention period. Firestore alone
  cannot stop an Admin SDK caller from deleting a row (the database has no
  trigger boundary like ADR 019's SQL design), so the locked log copy is the
  tamper-evident record.

### Revoke semantics

- Revoke sets `status: 'revoked'` and `updatedAt`, keeps the document, and
  writes `staff.revoke` with the previous status and role, as today.
- Effect is on the next moderation transaction, because `staff()` reads the
  grant inside every transaction. A transaction already running when the revoke
  commits is retried by Firestore and then fails `FORBIDDEN`. An action that
  committed before the revoke stands; it stays in the audit and can be reversed
  by another staff member through the normal restore/reinstate path.
- Post-commit steps of an already-committed action (such as retiring media
  after a takedown) continue, since the decision was authorized when made.
- No Auth session revocation is needed: staff authority is not carried in a
  token. Revoking staff never changes the person's ordinary account state.
- Re-granting a revoked UID keeps `createdAt` and records `previousStatus:
'revoked'`, as today.

### Retention, rate limits, monitoring

- **Retention.** `staff.grant`, `staff.grant.proposed`, `staff.revoke` and the
  proposals' audit rows are never purged. `redactModerationEvidence` selects
  case rows by `reportId`; a test asserts it leaves `staff.*` rows untouched.
  The Firestore copy and the locked log copy follow no TTL. Account erasure of a
  former staff member leaves the audit row keyed by `targetUid` and
  `operatorRef`; whether that is acceptable personal-data handling is a legal
  question this ADR does not answer.
- **Rate limits.** Use the existing fail-closed `nativeRateBuckets` limiter:
  5 grant or revoke operations per `operatorRef` per hour and 10 per project per
  day. If the limiter is unavailable the call is refused. Cloud Run request
  quotas back this up.
- **Monitoring.** A log-based metric on `staff.*` actions pages the owner on
  every grant, proposal and revoke, and on any `breakGlass: true` row. Further
  alerts: any IAM policy change on `staff-grants` or `staff-grants-sa`
  (Admin Activity logs); any invocation by a principal outside the operator
  group; any 4xx/5xx burst. A scheduled reconciliation (daily) compares active
  `nativeStaffGrants` against the latest `staff.grant` audit rows and alerts
  on a grant with no matching row, which signals an out-of-band write.

### Emulator command stays emulator-only

- `staff-grant.mjs` keeps its three guards unchanged and gains no hosted mode.
  The hosted code is a separate entrypoint in a separate deployable and is not
  imported by the script. The script is not included in the service image.
- The `emulator-label` identity is refused by the shared core when
  `FIRESTORE_EMULATOR_HOST` is unset or `K_SERVICE` is set; the hosted service
  refuses to start if `FIRESTORE_EMULATOR_HOST` is set.

## Alternatives rejected

- **Public or app-authenticated callable.** A bug or a stolen app session
  becomes self-promotion to moderator. App tokens must never confer staff.
- **Cloud Run job executed by `gcloud`.** The job cannot know who ran it, so
  the operator would again be a free-text argument. IAM identity must reach the
  code, which an invoker-gated service provides.
- **Manual console edit or `gcloud firestore import`.** No audit row, no
  two-person rule, no rate limit, and a typo can grant any role.
- **Operator's own Application Default Credentials running the script.**
  Broad personal Firestore access, laptop key exposure, and the identity is
  again self-declared. It also erodes the emulator-only guard.
- **Email, domain, or custom-claim staff roles.** Already rejected in ADR 019.
- **Storing the operator email in the audit row.** Puts a personal identifier
  in application data, makes the 90-day and erasure policies harder, and adds
  nothing the Cloud Audit Log does not already hold.
- **Keyless SHA-256 of `sub`.** Reversible by enumeration; HMAC costs one secret.
- **Two-person rule for revokes.** Slows the response to a compromised
  moderator. A mistaken revoke is cheap to undo; a late one is not.

## Trade-offs

- A new deployable and a secret to run and monitor, for a few grants a year.
- A solo owner cannot satisfy two-person approval without a second identity;
  break-glass is a documented, alarmed exception, not equivalence.
- Firestore audit rows are not database-enforced immutable; the locked log
  bucket compensates but adds a second store to keep consistent.
- `operatorRef` cannot be reversed by the app; investigators need Cloud Audit
  Logs access and the retained key to map it. That is intentional.
- Firestore IAM cannot restrict `staff-grants-sa` to named collections without
  IAM conditions, which are unverified; the real limit is the service's code
  and its narrow, reviewed surface.

## Test plan

- **Rules tests** (`@firebase/rules-unit-testing`): anonymous, signed-in, and a
  UID with an active administrator grant all fail to read or write
  `nativeStaffGrants`, `nativeStaffGrantProposals` and `nativeModerationAudit`.
  Confirm `firestore.rules` still contains only the deny-all match.
- **Trusted integration** (emulator, fails not skips): propose/approve by the
  same `operatorRef` is refused; approve by a different ref applies the grant
  and one audit row; expired and reused proposals are refused; grant to a
  non-active or missing account is `UNAVAILABLE`; revoke makes the next
  `listReports` fail `FORBIDDEN`; a revoke racing an `actOnCase` transaction
  either commits first or the action fails; revoking the last administrator is
  refused; idempotent retry returns one audit row; audit rows contain no email
  and no free-text operator label; `redactModerationEvidence` leaves `staff.*`
  rows.
- **ID token verification** (unit, fake issuer): bad signature, wrong audience,
  expired, missing `sub`, and service-account principals are rejected.
- **Script guard tests**: `staff-grant.mjs` exits non-zero with
  `GCLOUD_PROJECT=paldora-dev`, with no `FIRESTORE_EMULATOR_HOST`, with
  `GOOGLE_APPLICATION_CREDENTIALS` set, and with a non-loopback emulator host;
  a static test asserts the hosted entrypoint is not imported by the script and
  the script is absent from the service image; the core refuses the
  `emulator-label` identity when `K_SERVICE` is set.
- **Route inventory**: the service's three routes each have a rate-limit
  decision and a required-IAM assertion.

## Rollout

1. Land the identity-union refactor and emulator tests behind the existing
   local command (no hosted effect).
2. After D5 and Blaze: deploy `staff-grants` and `staff-grants-sa` to a
   disposable staging project, never the shared dev project first.
3. Run the hosted validation below, then the Phase 9 hosted gate.
4. Create the first administrator through the break-glass flow with the owner
   present, then remove the temporary binding.

**Unverified until run on a hosted project:**

- Cloud Run IAM-gated invocation with user ID tokens, and which claims
  (`sub`, `email`) they carry for the operator's identity type.
- That `staff-grants-sa` with only Firestore access can perform everything
  required, and whether IAM conditions can narrow it.
- Cloud Audit Log fields and retention for Cloud Run invocations, and whether
  Data Access logs for Firestore writes are available at acceptable cost.
- Locked-retention log bucket behaviour and the log-based alert latency.
- That the fail-closed limiter and transaction behaviour hold under Cloud Run.
- Revoke racing an in-flight transaction against real Firestore.
- Secret Manager access scoping and key rotation procedure.

## Revisit triggers

Revisit if the team grows past two operators (move to a group-based standing
approval), if D5 picks a platform other than Firebase/GCP, if legal review sets
audit retention or erasure requirements for operator identifiers, if Firestore
gains collection-scoped IAM or delete-protected collections, or if grants become
frequent enough to justify an approval UI.
