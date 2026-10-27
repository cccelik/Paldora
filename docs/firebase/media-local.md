# Local Firebase media runbook

Phase 5 runs against the disposable `demo-paldora` project. Keep public signup
disabled, `paldora-dev` on Spark, and hosted Firestore rules deny-all. The web
app serves private bytes through authenticated `/media/*` routes; Firebase
download URLs must never be rendered in a page or sent to a browser.

## Start and verify

Use Node 24 and install the locked workspace dependencies. Start the local Auth,
Firestore, Storage, Functions and Pub/Sub emulators with `pnpm firebase:local:dev` in one
terminal. Start the Firebase-mode web app with the command and environment in
`docs/firebase/implementation.md`. The emulator project must be
`demo-paldora`; the trusted media tests refuse any other project or missing
emulator. Use `pnpm firebase:trusted:test`, `pnpm firebase:local:flow:test`,
and `pnpm firebase:web:local:test` as the sequential local gates.

`nativeMediaAssets/{id}` is the source of truth. A reservation has an owner,
purpose, optional Box ID, expected MIME type and byte length, raw path, status,
lifecycle epoch, expiry and attachment IDs. Same-origin PUT verifies the
session, origin, exact bytes, declared and decoded type, and current Box access.
Processing uses Sharp to write metadata-free WebP master, display and thumbnail
objects under an attempt-specific private path. Publishing checks the epoch
and job claim, then deletes the raw object and sweeps abandoned attempt paths
before completing the job. A ready asset is only readable while
the corresponding post, Life Update, Room banner, avatar or camera reaction
still grants access. A second policy check runs after the Storage download.

## Native clients

Native apps use the same pipeline without cookies. `createMediaUpload`
reserves an asset; `PUT` the bytes to the `mediaUpload` Function
(`http://127.0.0.1:5001/demo-paldora/europe-west4/mediaUpload/{assetId}` in the
emulator) with the reserved `Content-Type`, the exact length and
`Authorization: Bearer <Firebase ID token>`; `completeMediaUpload` queues the
same processing job; `getMediaAsset` reports `status`, `available`, `width` and
`height`. Read display or thumbnail WebP from `mediaRead/{assetId}/{variant}`
with the bearer. Both functions check the session epoch like a callable, apply
rate limits (`mediaUpload` 480, `mediaRead` 6000 an hour), and run
`NativeMedia.upload` and `NativeMedia.read`, so Box membership, blocks, content
state and the post-download recheck behave exactly as on web. Every refusal for
an asset the caller may not see is the same `404`; `401` is only for a missing,
invalid or ended session. Responses are `Cache-Control: private, no-store` and
never contain object keys or URLs. `pnpm firebase:local:flow:test` covers the
full round trip, including rejected uploads and revocation.
Contract: `contracts/native/README.md`.

## Repair and retirement

Every processing or deletion intent is recorded in `nativeJobs` before the
task queue is asked to run. The `repairMediaJobs` scheduled Function retries
pending or expired-lease jobs, drains post cleanup and expires unattached
assets. A failed task reaches `dead` after five attempts. Inspect the job and
Storage state before replaying a dead job in the **disposable emulator**:

```sh
pnpm firebase:media-repair:local
pnpm firebase:media-repair:local -- --retry media-process-<asset-id>-<epoch>
```

The repair script refuses a non-demo project or missing local Firestore and
Storage emulator addresses. The replay command requires an explicit dead job
ID; it does not open public access. When deletion or a moderator takedown
starts, Firestore marks the asset unavailable first. Object retirement scans
the whole private asset prefix, including paths written by a crashed processor,
and returns success only when the prefix is empty. A failed Storage operation
leaves the cleanup intent for repair. `media-post-cleanup-{postId}` retires post
photos and camera reactions in batches; Box deletion retires all Box-scoped
objects before removing their metadata.

Local tests must still cover crashes between derivative writes and Firestore
publication, in-flight processing versus deletion, and the latest Room banner
and camera reaction paths. Hosted task timing, queue IAM, cost/load, backup and
object-retirement checks remain a later deployment gate; Spark cannot validate
that gate.
