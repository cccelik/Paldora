# Phase 9 moderation and account lifecycle operations

Public signup stays disabled. This runbook supports provisioned accounts and
local validation on the Firebase emulators (`demo-paldora`). No staging or
production hosting project has been chosen for D5, and the external
appeal/moderation email address has not been set. Both are open owner
decisions before public signup. Nothing here has been run against a hosted
project.

## Staff and reports

Moderator access is a `nativeStaffGrants/{uid}` document with `status: active`,
keyed to the account's Firebase Auth UID, and the account itself must also be
`active`. Both are checked inside every moderation transaction
(`packages/firebase-trusted/src/native-moderation.ts`). Clients cannot read or
write grants. **The only audited operator command is local-emulator only:**
`pnpm firebase:staff:local -- --grant <uid> --role moderator|administrator
--operator <label>` or `-- --revoke <uid> --operator <label>`. It refuses
unless `GCLOUD_PROJECT=demo-paldora` and `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`,
and refuses if `GOOGLE_APPLICATION_CREDENTIALS` is set. Grants require an
active account, revokes keep the grant with `status: revoked`, and each writes
a `nativeModerationAudit` row (`staff.grant`/`staff.revoke`) with a non-email
operator label. There is still no hosted grant path: building one is an open
gate before hosted moderation. The e2e seed
(`packages/firebase-trusted/scripts/seed-e2e.mjs`) still writes a grant
directly, for disposable emulator data.

A moderator opens `/moderation` to review reports. Opening a case and
recording an action append audit rows. A report is an allegation, so the queue
does not automatically hide its target. Staff must give a concrete reason of at
least 20 characters for every action and avoid copying unrelated personal
information into it.

On a content takedown, the trusted service retires the affected Storage objects
before returning success. Restore makes text visible again, but retired media
needs reprocessing or a new upload. If Storage is unavailable, the takedown
fails and can be retried. Verify ordinary post, comment, Room, media, and feed
reads after a takedown; do not treat a previously issued media URL as proof of
a successful takedown. Media routes re-authorize on every read, so a retired
asset must return not-found on the next request.

The content author sees hidden posts and comments in Settings → Content
notices. The notice exposes no reporter or case evidence. During the private
beta, the invitation contact is the review path; replace it with the approved
external moderation address before public signup. Do not present an unset
address as a working appeal channel.

The `redactModerationEvidence` scheduled function (every 24 hours) removes
closed report evidence and case audit rows 90 days after the case closed. If
content is still hidden or an account still suspended, the report detail and
reporter ID are erased while a minimal case pointer remains. Staff can find it
in the Closed cases tab and reverse enforcement; the pointer is purged after
the state becomes inactive. Open reports and standalone staff-grant and
account-lookup audit remain. Do not manually delete audit rows.

## Export and deletion

Account deletion and export are trusted-service workflows with durable state in
Firestore and bytes in private Storage. See
[account-lifecycle.md](../firebase/account-lifecycle.md) for the state machine
and local repair commands.

The owner can request a `paldora-json-v1` archive in Account settings. The
`repairAccountLifecycle` function (every minute) builds it from bounded
Firestore pages and streams it to private Storage; the archive contains media
metadata, not media bytes, and expires after seven days. The download route
(`/settings/account/download`) re-checks the session on every request and
streams with `private, no-store`. An account deletion request requires
password reauthentication through Firebase Auth and prior transfer of every
owned Box. The recorded deadline is seven days after the request; cancellation
requires the password and is rejected at or after that deadline.

At the deadline, the repair function atomically changes the account to
`deleting`, revokes Auth sessions, and denies all web access even while
cleanup retries. It then deletes owned media and export objects, content and
references, the Auth user, and finally the account records. Every step is
generation-checked, so a cancelled or re-requested deletion cannot be
completed by a stale run. A request that stays in `deleting` needs
investigation of Storage, Auth, or Firestore failures; fix the dependency and
let the next run retry. Never mark a request complete by hand. A request in
`blocked` means Box ownership still needs resolution. A pending request past
its deadline may be waiting for an in-flight upload to finish or expire.

Local repair against the emulators (see
[account-lifecycle.md](../firebase/account-lifecycle.md) for the full
environment): `pnpm firebase:box-repair:local`,
`pnpm firebase:media-repair:local`, and `pnpm --filter @paldora/firebase-trusted
repair:account:local`.

## Hosted gate before signup

The Firebase project `paldora-dev` stays on Spark. Scheduled functions need
Blaze, so none of the schedules above are proven hosted. After D5 hosting is
chosen, validate with disposable provisioned accounts on the hosted
environment: a blocked or unauthorized reporter cannot identify a target; a
moderator can process a case with an audit trail; a takedown makes an
already-issued media URL fail; suspension ends web and stream access; JSON
export is private and expires; deletion can be cancelled before the deadline
and finishes after it; scheduled-function retries survive a deliberate
dependency outage; IAM grants only the intended service accounts. Review queue
staffing, appeal contact, rate-limit behavior, logs, backup and restore,
alerts, load and cost with the owner before any signup activation.
