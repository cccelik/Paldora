# Local Firebase account lifecycle

Phase 7 uses `NativeAccountLifecycle` in `@paldora/firebase-trusted`. The web
session is an HttpOnly cookie; Server Actions require the same-origin mutation
check. An account export or deletion cannot be requested by a browser Firebase
client. Hosted Firestore and Storage rules remain deny-all, signup is closed,
and `paldora-dev` remains on Spark.

## Export

The owner requests a `nativeExports/{uuid}` row. A trusted worker streams a
`paldora-json-v1` object containing the owner's account/profile/preferences,
authored posts, comments and reactions, canonical Life Updates, Room settings,
and owned media metadata. Raw and derivative bytes are excluded. The archive
is written in bounded Firestore pages to `private/exports/{uid}/{uuid}.json` in Storage. Its status moves
from `pending` to `ready` only while the account is still active. Expiry is
seven days after the ready timestamp. A same-origin route streams the object
with `private, no-store`; it verifies the cookie and account before starting
the Storage stream. It never returns a Firebase download URL.

`repairAccountLifecycle` retries pending exports, deletes expired objects, and
scans the private export prefix for orphan bytes left by a crash after Storage
write. A failed export remains pending for repair with an attempt count and
last-failure timestamp; the web does not claim it is ready. Large-archive
throughput and Storage costs still need a hosted load gate before release.

## Deletion

Request and cancellation require fresh password reauthentication against the
account's Firebase Auth UID. The request is rejected while the member owns any
Box. A pending request also prevents another owner from transferring a Box to
that member. The exact cancellation deadline is `requestedAt + 7 days`; a
transaction compares both the generation and deadline. At or after the
deadline, the repair worker atomically changes the account to `deleting` and
the request to `running`. All trusted reads and mutations reject the account
from then on. It revokes Auth refresh tokens and retries revocation during the
media phase.

Each `processDeletion` call performs one resumable phase or bounded batch:

1. Retire owned media objects and delete asset records.
2. Delete private export objects and records, including orphan bytes in that
   owner's prefix.
3. Remove authored posts and their descendants/pointers, Life Updates and
   deliveries, authored comments, and reactions.
4. Remove friendship/block/invitation, membership, feed, notification,
   activity, Room top-friend, and account Box references. Reporter identity and
   report detail are redacted from retained moderation cases; 90-day
   closed-case evidence retention remains in force.
5. Delete Firebase Auth, then profile, settings, username reservation, account,
   and the deletion request last.

The generation and phase are checked before each batch. Repeating a phase is
safe after a crash; fault-injection tests stop at every phase boundary and
restart with the persisted request. A `blocked` request means a Box ownership
precondition appeared before freeze and an operator must resolve that ownership
before processing can resume. Once due, cancellation stays closed even if
processing is blocked.

For a local repair against the disposable emulators, start Auth, Firestore,
Storage, and Functions with `firebase.native.json`; the scheduled
`repairAccountLifecycle` worker runs every minute. The trusted integration test
uses only `demo-paldora` and exercises archive expiry, ownership transfer,
exact cancellation timing, media retirement, and restart at every phase.
While the disposable emulators are running, an operator can also run
`GCLOUD_PROJECT=demo-paldora FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 pnpm --filter @paldora/firebase-trusted repair:account:local`.

Hosted scheduling, Storage object enumeration cost, large-archive memory,
backup/restore, and IAM must be validated after a separate Blaze decision.

## Native clients

The same `NativeAccountLifecycle` serves the native callables
(`requestAccountExport`, `getAccountExport`, `getAccountDeletion`,
`requestAccountDeletion`, `cancelAccountDeletion`) and the authenticated
`accountExportDownload` HTTP Function (`GET /{exportId}`, bearer Firebase ID
token, `contracts/native/README.md`). Rules are unchanged: fresh password
reauthentication, no owned Box, `requestedAt + 7 days`, generation checks. The
download streams only the caller's latest ready archive and answers every
other id with the same 404. Hosted Functions need `FIREBASE_WEB_API_KEY` (the
same Auth REST key as the web) in their environment for the password
callables; without it they fail closed as `failed-precondition`. Large
archives stream, but a hosted load gate is still required.
