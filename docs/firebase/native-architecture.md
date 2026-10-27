# Firebase-native migration decision

Status: **active design direction, conditional on privacy proof** (2026-10-22).
This supersedes the server-owned API assumption in
[the original Firebase rewrite plan](../plans/firebase-rewrite.md). The current
The NestJS API has been removed from the active workspace; this document records the native-client direction on the Firebase backend.

## Decision

Use Firebase Auth and direct Firestore client SDK access for operations whose
complete authorization and integrity rules can be proved in Security Rules.
Use Firebase-managed trusted code only for actions that cannot safely be made
client-owned: account provisioning and revocation, moderation and audit,
media validation/processing and immediate object retirement, durable retries,
export, and seven-day deletion. The target does not need to preserve the NestJS
HTTP API as a separate deployed service. Future native clients can use the same
Auth, Rules, and Firestore schema; trusted operations can use callable or HTTPS
Cloud Functions when those are needed. Keep the current API contract as a
behavioral and migration checklist until every feature has a replacement.

This is **one provider, not one service**: Auth, Firestore, Storage, Functions,
and App Hosting have different security and billing boundaries. We will not
upgrade `paldora-dev` from Spark without a later owner instruction. Local
emulators and Spark Firestore can support design and limited development, but
the full hosted migration cannot ship on Spark because Functions deployment,
App Hosting, and new Cloud Storage buckets require Blaze.

## Direct-client boundary

- Every client read and write must pass a rule that checks a current active
  account, membership or ownership, blocks, and moderation state as applicable.
  Firestore rules are not query filters: a permitted query must be constrained
  so that **every potential result** is authorized. No collection scan may rely
  on post-fetch filtering for access control.
- Membership and owner changes use atomic multi-document writes guarded by
  `getAfter()` or are handled by trusted code. A projected index is a hint,
  never an authority; content must be checked again at its source path.
- Rules have document-access-call limits. Model and measure authorization reads
  for multi-Box feeds, Memories, and block-heavy pages before opening those
  collections to clients. If a bounded, privacy-equivalent query cannot be
  proved, keep that operation behind a trusted Firebase Function rather than
  broadening rules.
- Private media needs an independent Storage authorization design. Firestore
  permission does not revoke a previously issued download URL; immediate
  moderation takedowns still require object retirement and hosted tests.
- Client caching and listeners need explicit removal/suspension tests. A server
  rule rejection prevents new reads but does not by itself erase bytes already
  cached on a device. Do not promise instant remote erasure of cached copies.

## First executable slice

`packages/firebase-native` uses the Firebase client SDK to create one Box,
its owner membership, and the owner's private Box-ID hint in one batch.
`firebase/firestore.native.rules` checks all three documents with `getAfter()`,
requires a trusted-provisioned active account, allows active members to read
the Box, and denies unauthenticated, nonmember, suspended, partial, and
forged writes in emulator tests. Box listing starts from private ID hints and
re-authorizes each Box read. No other collection is open.

The local trusted `NativeAccounts` prototype checks Firebase Auth before
creating an active account: the Auth user must exist, be enabled, have a
verified email, and carry the Admin-set `paldoraAdmitted` claim. Provisioning is
idempotent only for an already-active account;
it cannot turn a suspended account active again. Suspension writes account
status first, which the Firestore rules consult on every read, then revokes Auth
refresh tokens. The Auth and Firestore emulators exercise this flow. Web
sessions, account linking for any existing SQL users, error recovery, and
hosted callable/operator entry points are still open. A local callable now
allows an already-created, Admin-admitted verified Auth user to provision their own account;
it does not enable public Firebase Auth registration.

The native rules are **experimental and not deployed**. The hosted development
project still uses the deny-all `firebase/firestore.rules`. An additional
transaction now transfers ownership to an existing active member: it changes
the Box owner/version and both member roles together. Emulator tests reject
partial writes, suspended successors, stale transfers, and simultaneous
successors. Direct-client role changes, member removal, and leaving now follow
the current role policy, with a transfer/removal race test and immediate read
revocation for inactive memberships. Owner-only rename and archive/reopen are
also guarded by Box version; archived Boxes reject member changes and transfers.
Invitations, deletion, the full existing race matrix, and hosted contention/cost
measurements still need proof
before replacing the current Box implementation. The web application still
calls the current API.

`packages/firebase-trusted/src/native-box-invitations.ts` now exercises the
trusted invitation boundary against the same `nativeBoxes` and `nativeAccounts`
shape. It accepts a resolved UID, checks the inviter's role, both account
states, target membership, Box state, and a deterministic block-pair document
inside a Firestore transaction. Acceptance rechecks the block and expiry, then
writes membership and the private Box hint atomically. Client rules deny direct
reads and writes to invitation and block documents. The local trusted
`NativeBlockPairs` prototype advances a pair epoch whenever someone blocks;
an invitation records the current epoch, so unblocking cannot revive an older
pending invite. `inviteByUsername` uses the existing username normalization and
rechecks the trusted `nativeUsernames/{normalized}` mapping in the invitation
transaction; the client cannot read or forge that mapping. A local trusted
`NativeUsernames` transaction now reserves names, moves reservations on rename,
and rejects concurrent collisions. The local Functions emulator exposes
Auth-bound invitation and username callables, and an integration test proves
the create/invite/accept/member-read flow with two Firebase Auth users.
The app is not yet wired to these callables. A recipient-side listing callable
pages through pending invitations and rechecks account state, Box state,
expiry, and block epoch before returning Box details. Local callable limits
are in place; sender-side invitation listing, complete block effects, and
hosted function deployment are still required.
The local Box member-list callable uses bounded candidate pages and rechecks
the viewer and each member before returning an active person's username and
role. It filters blocked pairs and suspended accounts. Client collection
listing remains denied.
Every block
operation must write the same pair document, so a block and an
invitation/acceptance conflict and retry rather than passing each other.
Trusted decline and manager revocation transactions now close an invitation;
an accept/revoke race commits one outcome, never both.

The local `NativeFriendships` service resolves recipients through the trusted
username index and rechecks both active accounts and the block pair in each
transaction. Auth-bound callables send, accept and close requests and return
bounded incoming, sent or accepted pages. A block closes an existing request or
friendship atomically with the block-pair update; unblocking does not restore
it. Firestore rules keep relationship documents private. Room visibility,
notifications, account deletion and browser behavior still need parity work.

The local-only content slice stores text-only posts beneath a Box. Callable
Functions derive the actor from Firebase Auth; trusted transactions check live
account and membership state for writes and reads, and exclude blocked authors
from post reads. A bounded candidate page returns a cursor even when every
candidate is hidden. Clients cannot read or write post documents directly.
Local trusted comment and emoji-reaction callables now cover one reply level,
author edits/deletes, one reaction per person and target, and block-aware
candidate listing. This is a privacy prototype, not content parity: media,
camera reactions, interaction summaries, notifications, feeds, full moderation,
and web wiring remain open.
Every local callable now consumes a Firestore-backed per-user action bucket
before executing. The limiter fails closed on Firestore errors and its
concurrency boundary is emulator-tested. Window limits and operating costs
need hosted review before any signup gate changes.
Local text-post reporting uses a trusted transaction to check the reporter's
current access. A staff grant is required to list reports or hide a post;
the hide transaction closes the report and appends an audit record. Direct
client rules still deny reports, grants, and audit data. This does not prove
media takedown, full evidence retention, appeals, or hosted staff operations.
Closed text-post reports are eligible for bounded redaction after 90 days;
the trusted maintenance transaction removes reporter identity and reason but
keeps the minimal action pointer and audit record. Scheduling and evidence
object cleanup remain open.

## Native contract

Native clients will use the callable Functions as their contract, not the
retired HTTP API. Today that is 49 `onCall` functions plus 2 `onRequest` media functions in `europe-west4`, each
rate-limited by `limited()`, with ad-hoc `field()` input checks, outputs typed
in `packages/firebase-trusted` (epoch-millisecond timestamps), `HttpsError`
codes with generic messages, an optional non-leaking `details.reason` for sign-in, session, input and rate-limit failures only, and opaque cursors
in several formats. Direct Firestore access is experimental and limited to
`nativeAccounts/{uid}/boxRefs`, `nativeBoxes/{id}` and
`nativeBoxes/{id}/members/{uid}`; everything else and Storage are deny-all.
The first ADR 021 decision 8 slice adds profile, preferences, Boxes
(list/create/get), notifications and the Home feed. These return opaque media
asset ids only, never URLs or object keys. Media follows the same rule: three callables
(`createMediaUpload`, `completeMediaUpload`, `getMediaAsset`) reserve, complete
and describe an asset, while two authenticated HTTP Functions (`mediaUpload`,
`mediaRead`, bearer Firebase ID token, session-epoch check, rate limits, the
web's per-request media authorization, uniform 404) move the bytes. No signed
URL or Firebase download URL is issued, so a block, removal or deletion closes
reads immediately. No native entry point exists yet for Rooms, Memories,
account export/deletion, or password/session changes. Callables compare the ID token's session epoch
with the account's (a rotated epoch answers `unauthenticated`, ADR 021
decision 5). The proposed registry, fixtures, rules and open owner decisions are in
[ADR 021](../adr/021-firebase-native-contract.md) and
[contracts/native](../../contracts/native/README.md).

## Migration gate

Move one vertical slice at a time: identity/account state, social graph and
Boxes, content/feeds/Rooms/Memories, media and background work, moderation and
account lifecycle. For each slice, port current adversarial tests, run client
rules tests in CI, test hosted behavior when billing is authorized, reconcile
any existing data, and only then switch the web path. Remove the old API and
its infrastructure after **all** slices, full browser parity, data validation,
and rollback review pass. Public signup remains closed pending the separate
abuse and operations gate.

## References

- [Firestore rules and queries](https://firebase.google.com/docs/firestore/security/rules-query)
- [Security Rules access limits](https://firebase.google.com/docs/rules/rules-behavior)
- [Rules unit testing](https://firebase.google.com/docs/rules/unit-tests)
- [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
