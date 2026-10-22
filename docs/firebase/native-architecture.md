# Firebase-native migration decision

Status: **active design direction, conditional on privacy proof** (2026-10-22).
This supersedes the server-owned API assumption in
[the original Firebase rewrite plan](../plans/firebase-rewrite.md). The current
NestJS API remains live while the replacement passes the gates below.

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

`packages/firebase-prototype/src/native-box-invitations.ts` now exercises the
trusted invitation boundary against the same `nativeBoxes` and `nativeAccounts`
shape. It accepts a resolved UID, checks the inviter's role, both account
states, target membership, Box state, and a deterministic block-pair document
inside a Firestore transaction. Acceptance rechecks the block and expiry, then
writes membership and the private Box hint atomically. Client rules deny direct
reads and writes to invitation and block documents. It is **not callable from
the app**: verified Auth context, username resolution, rate limits, invite
listing/revocation, block writes, and hosted function deployment are still
required. Every block operation must write the same pair document, so a block
and an invitation/acceptance conflict and retry rather than passing each other.

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
