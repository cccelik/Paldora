# Phase 9 moderation and account lifecycle operations

Public signup stays disabled. This runbook supports provisioned accounts and
local or staging validation while production hosting decision D5 remains open.

## Staff and reports

Grant or revoke staff access with the audited operator CLI described in
`apps/api/src/moderation/staff-command.ts`. Moderator access is keyed to the
internal user UUID. A moderator can open `/moderation` to review reports;
opening a case and recording an action append audit rows. A report is an
allegation, so the queue does not automatically hide its target. Staff should
use a concrete reason of at least 20 characters for every action and avoid
copying unrelated personal information into it.

On a content takedown, the API deletes storage objects before returning
success. Restore makes text visible again, but retired media needs a new
upload. If object storage is unavailable, the takedown fails and can be
retried. Verify ordinary post, comment, Room, media, and feed reads after a
takedown; do not use a previously issued signed URL as proof of a successful
takedown until object storage confirms deletion.

The 15-minute maintenance reaper removes closed reports and their case audit
rows 90 days after `closed_at`, up to 100 cases per run. Check
`purgedModerationCases` in the reaper log. Open reports and standalone
staff-grant/account-lookup audit remain. Do not manually delete audit rows;
the database guard permits only due case rows.

## Export and deletion

The API requires `NEXT_PUBLIC_SUPABASE_ANON_KEY` to reauthenticate a deletion
request. The worker requires `SUPABASE_URL` and a privileged
`SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`) to hard-delete
the Auth identity. Give this key to the worker only. Without it, the worker
does not process due deletions; production startup rejects that configuration.

The owner can request a JSON archive in Account settings. The worker builds it
asynchronously; the completed archive expires after seven days. The download
route resolves a fresh owner-only signed URL when clicked. An account deletion
request requires the current password and transfer of every owned Box. The
recorded deadline is seven days after request; cancellation requires the
password and is rejected at or after that deadline.

At the deadline, the worker changes the account status to `deleted`, denying
API access even while external deletion retries. It then deletes owned media
and export objects, deletes the Auth user, and removes the database user.
Observe `erasureStarted` and `erasureCompleted` in the reaper log. A request
remaining in `erasing` needs investigation of object storage, Auth, or
database failures; fix the dependency and let the reaper retry. Never mark a
request complete by hand. A request in `blocked` means Box ownership still
needs resolution. A pending request past its deadline may be waiting for an
in-flight upload to finish or expire.

## Hosted gate before signup

After D5 hosting is chosen, validate with disposable provisioned accounts on
the hosted environment: a blocked or unauthorized reporter cannot identify a
target; a moderator can process a case with an audit trail; a takedown makes
an already-issued media URL fail; suspension ends API and stream access; JSON
export is private and expires; deletion can be cancelled before the deadline
and finishes after it; worker retries survive a deliberate dependency outage.
Review queue staffing, appeal contact, rate-limit behavior, logs, backup
retention, and alerts with the owner before any signup activation.
