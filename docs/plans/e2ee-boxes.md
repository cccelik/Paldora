# End-to-end encrypted Boxes: implementation plan

Status: proposal for later implementation, **not an encryption claim or an
authorization to ship**. Prepared 2026-10-22. Public signup remains disabled.
This plan implements the long-term constraint in `CLAUDE.md` §D: use an
established protocol, design client key management, obtain independent review,
and never invent cryptography. It targets **Box content**, not every Paldora
field. A Firebase rewrite is a separate proposal in [firebase-rewrite.md](firebase-rewrite.md).

## Outcome and honest promise

After completion, a Box member's device encrypts Box post text, comments,
reactions that carry private media, Life Update content delivered to the Box,
and photos **before upload**. Authorized member devices decrypt them. Paldora
stores ciphertext and routing metadata; operators with database, storage, or
Firebase credentials cannot read those content bytes. This promise applies
only to content created or migrated under the reviewed protocol and only while
endpoints and their delivered application code are trustworthy.

The server will still know account IDs, Box IDs and membership, creation
times, approximate sizes, delivery relationships, moderation state, and
activity frequency. Other Box members can copy, screenshot, or report content.
The web app's server controls the JavaScript delivered to browsers; a malicious
or compromised deployment could capture plaintext or keys. Native clients
with independently distributed, signed releases would strengthen that part of
the model. **Do not claim operator-proof or zero-knowledge privacy without a
separate analysis of code delivery, backups, metadata, and recovery.**

## Decisions and gates before implementation

Use these provisional defaults for design and estimates; document owner
approval in a new ADR before production work:

| Decision           | Proposed default                                                                                                              | Why it matters                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Scope              | New opt-in encrypted Boxes first; existing Boxes remain unchanged until explicit migration.                                   | Prevents silent loss of features or historical data.                                                                      |
| Protocol           | MLS (RFC 9420) via a mature, audited implementation; independent review of integration.                                       | Group membership changes and multiple devices need a standard protocol.                                                   |
| Device model       | One MLS client per device/browser profile, registered with a verifiable device identity.                                      | Sharing one private key across devices weakens compromise isolation.                                                      |
| New member history | No access to content before joining by default.                                                                               | MLS does not grant old plaintext to a newly added member. Optional history sharing needs a separate protocol and consent. |
| Removed member     | Cannot decrypt future epochs; cannot erase plaintext or keys they already saved.                                              | Set the correct expectation for Box removal and blocks.                                                                   |
| Recovery           | User-held recovery secret or trusted-device transfer; server cannot reconstruct keys.                                         | Recovery convenience must not quietly give operators content access.                                                      |
| Moderation         | Member-submitted, explicitly disclosed evidence; server can retire ciphertext and suspend accounts.                           | Staff cannot inspect unreported plaintext.                                                                                |
| Non-Box content    | Existing server-readable account/profile/Room data stays as-is initially. Only Me content needs a separate device-key design. | Avoids describing the whole product as E2EE.                                                                              |

**Discovery go/no-go:** verify that a supported MLS implementation can run in
Paldora's browser target and eventual Swift/Kotlin clients with compatible
wire format, secure state storage, licensing, maintenance, and independent
review. Verify usable recovery and membership flows with real device tests.
If no maintainable implementation fits, stop; do not build an ad-hoc group
ratchet. MLS defines group key establishment but the application still has to
design identity binding, credential verification, delivery ordering, storage,
attachments, and recovery.

## Threat model

Protect Box content from: a curious database/storage administrator; stolen
server credentials; a database or object-store breach; another Paldora user
who is not a current member; a removed member reading new content; a server
trying to substitute a member's public key; and accidental plaintext in logs,
notifications, thumbnails, exports, and backups.

Explicit limits: a member or compromised endpoint can disclose content; an
attacker controlling the web build can target users until code-delivery
controls or independent clients detect it; traffic and membership metadata are
not hidden by this phase; deletion cannot retract copies held by recipients.
Separate confidentiality, sender authenticity, forward secrecy,
post-compromise recovery, integrity, availability, and metadata privacy in the
threat model. State which are guaranteed by MLS and which depend on Paldora's
integration. Obtain review of the threat model **before** writing production
crypto code and repeat review against the finished implementation.

## Architecture and trust boundaries

```text
Member device/browser
  identity/device key + MLS group state (local secure store)
  plaintext -> client validation/media processing -> encryption
  encrypted record + opaque routing metadata -> existing /api/v1

API and durable store
  authenticate account/device; authorize Box membership and epoch
  order membership commits; store and deliver ciphertext
  never receive plaintext, media keys, or private MLS state

Other member device
  verify device/key identity and epoch -> decrypt -> render locally
```

Keep the existing server authorization layer: E2EE does not replace Box role,
membership, block, suspension, rate-limit, or takedown checks. A client may
cryptographically decrypt a cached item after removal; the API must also stop
new delivery and future key material. Preserve the versioned HTTP contract for
future native clients. Firebase versus PostgreSQL changes storage adapters,
not the protocol boundary. Avoid direct database listeners carrying plaintext
or private key material.

## Identity, devices, and group membership

1. **Device enrollment.** Each device generates signing and key-agreement
   material locally. Bind its public credential to the authenticated internal
   user ID and a stable device ID. The server never generates device secrets.
   Publish an append-only device-key log or equivalent transparency mechanism;
   at minimum show safety-code changes and require member confirmation on
   unexpected key changes. A server-controlled key directory alone allows
   silent key substitution and must not support a strong operator-blind claim.
2. **Local state.** Web stores non-exportable key material where supported and
   protects MLS state at rest with a key derived from a user-held secret or
   platform facility. Test browser profile loss, private browsing, storage
   eviction, and cross-tab concurrency. Native clients later use Keychain and
   Keystore. Never place recovery keys in Paldora-controlled analytics,
   backups, session cookies, URLs, or logs.
3. **Joining.** Owner/admin invitation remains a server-side authorization
   decision. A current authorized device creates the MLS Add/Commit and
   Welcome for each invited device. Define what happens when all current
   devices are offline; no server-created member key. The invited member
   verifies Box identity and device credentials before accepting the Welcome.
   No automatic old-history grant.
4. **Leaving, removal, block, suspension.** Membership removal and MLS Remove
   commit must be coordinated. Freeze new Box writes while the epoch transition
   is pending, then atomically publish the new epoch and membership state from
   the API's viewpoint. Retry safely after client or server failure. If the
   last authorized key-holder is unavailable, mark the Box temporarily
   unable to accept content rather than let removed members retain future
   access. A block still follows Paldora's current social semantics; it does
   not automatically expel both users from a shared Box.
5. **Multiple devices.** Treat each device as a group leaf. New devices need
   explicit approval from an existing trusted device or user-held recovery
   secret. Revoke lost devices and advance every affected Box epoch. Include
   device-list review in Settings. Test concurrent commits, offline clients,
   stale epochs, replay, duplicate delivery, and reinstallation.
6. **Ownership transfer and Box deletion.** A Box has one authoritative owner
   in the server's membership model. Transfer does not change confidentiality
   by itself unless a device joins/leaves. Permanent delete retires all
   ciphertext objects and metadata; recipients may retain copies.

MLS requires a delivery service to consistently order group commits and an
authentication service to bind keys to people. The server cannot be allowed
to silently insert an operator device. Acceptance criteria include client
verification of credentials and detection of unexpected device additions.

## Content format and keys

Define a versioned binary envelope with `formatVersion`, content type, Box ID,
record ID, sender device ID, MLS group/epoch reference, ciphertext length,
and authenticated metadata. Use a vetted MLS library to derive application
secrets and authenticate messages. Specify replay and duplicate handling,
nonce/key uniqueness, and maximum sizes. Cryptographically bind the envelope
to its intended Box and record type to prevent cross-context substitution.
Maintain golden vectors across web and eventual Swift/Kotlin clients.

- **Posts/comments:** encrypt complete text and any private structured fields;
  keep only routing IDs, timestamps, moderation flags, and strictly necessary
  counters server-readable. Server validation can enforce ciphertext size,
  role, rate, and schema version, but cannot inspect text length or prohibited
  content. Client validates the current 5,000/2,000-character limits; abuse
  controls must account for clients that lie.
- **Edits/deletes:** write a new authenticated encrypted version or tombstone.
  Recipients who cached an old version may keep it. Preserve author-only
  mutation authorization on the server and audit version/epoch changes.
- **Reactions:** an emoji reaction can reveal sentiment; encrypt its value or
  explicitly declare it outside the content promise. Deterministic server
  uniqueness per target/user may remain, with private counts designed and
  documented. Camera reactions use the encrypted media pipeline.
- **Life Updates:** one plaintext composition on the author's device, then a
  separate ciphertext/envelope for each destination Box. Do not reuse the
  same content-encryption key across Boxes unless a reviewed multi-recipient
  scheme preserves access separation. Each Box retains its own backing post
  and conversation. Only Me uses a separate personal-device key protocol or
  remains outside this phase with clear UI labeling. Account for up to 20
  deliveries and media copies/keys in cost and latency budgets.
- **Memories and feeds:** continue deriving chronological candidate IDs and
  enforcing server access; decrypt visible items on device. No plaintext
  materialized feed or search index. Initial encrypted Box search is local
  over downloaded content only; measure storage and UX cost.
- **Room previews:** a Room must not widen Box access. For encrypted Boxes,
  use only an opaque/link preview until an authorized viewer's client decrypts
  it. Do not render private content in server-side HTML, OpenGraph metadata,
  notifications, or logs.

## Media pipeline

Before upload, the client decodes with pixel/format limits, applies orientation,
strips metadata, creates bounded display and thumbnail variants, then encrypts
each variant with an independently generated content key wrapped for the Box's
current epoch. The server sees ciphertext and validates byte limits, declared
purpose, ownership, checksum, and authentication, but cannot verify image
pixels or metadata stripping. Document this weaker server-side assurance and
test the client implementation with hostile images. Reject unsupported or
oversized input locally. Keep all objects private; signed URLs still require
current membership, but ciphertext remains confidential if a URL leaks.

Deletion/takedown immediately retires every encrypted object and disables all
new reads. Preserve the current already-issued URL test. Key rotation does not
retroactively revoke a member's old downloaded ciphertext or content key.
Avoid a shared CDN/plaintext image transform service. Profile avatars and Room
banners remain outside the encrypted Box scope unless redesigned separately.

## Moderation, export, and deletion

**Reports:** a reporting member chooses specific posts/comments and explicitly
discloses a decrypted evidence bundle to staff. The client includes item IDs,
plaintext excerpt or media, sender/device signatures, epoch reference, and
cryptographic hashes of the original ciphertext. Staff verify the evidence
relationship as far as the protocol permits; they cannot infer unreported
context. Explain to reporters exactly what staff will see. Evidence is
server-readable, access-controlled, audited, and subject to the existing
90-day closed-case retention. Never present report evidence as invisible to
Paldora. Staff can hide ciphertext, retire media immediately, suspend accounts,
and record reasons without decrypting other Box content. Appeals use the
external contact still to be set before signup.

**Export:** provide encrypted archive download plus client-side decryption of
the member's currently accessible own content. Define handling of lost keys,
deleted content, and shared Box history. The server can export ciphertext and
account metadata but cannot produce a plaintext JSON archive; replace the
current server-built JSON archive only after an equivalent user-controlled
format is tested. Never upload decrypted archives to the server.

**Deletion:** preserve the seven-day cancellation window and Box-ownership
transfer prerequisite. The worker deletes the account's own ciphertext and
media where policy allows and retires Auth identity; copies authored into a
shared Box may remain visible to other members under the agreed policy, or be
removed if the existing deletion promise requires it. Decide and disclose the
exact outcome before implementation. Delete key-directory entries and device
material held by the server, but do not claim that recipients' keys or copies
are erased. Backups and retained report evidence require separate handling.

## Web delivery and endpoint security

E2EE on a browser still trusts the web application delivered on each visit.
Use strict CSP and Trusted Types where supported, pinned dependency review,
reproducible builds, release signing/attestation, two-person deploy approval,
restricted production access, and monitoring for unexpected bundles. These
reduce the chance of a malicious release; they do **not** make a web app
cryptographically independent of its operator. Prefer native signed clients
for a stronger claim later. Ensure decrypted text/images stay out of server
components, telemetry, crash reports, browser caches, service workers,
link previews, accessibility snapshots sent to monitoring, and support tools.
Security review must cover XSS, malicious extensions, device compromise,
clipboard/downloads, and key extraction risk.

## Migration and rollout

Existing plaintext Box content does not become E2EE by flipping a setting.
Offer new encrypted Boxes first behind an opt-in flag and conspicuous labeling.
For an existing Box, require owner initiation and member/device readiness;
freeze writes; have an authorized client's device download plaintext,
re-encrypt it under the new group, upload/checksum ciphertext, and verify other
members can decrypt before retiring plaintext and plaintext backups under a
documented retention process. A server-side migration would see plaintext and
cannot establish an operator-blind history claim. Maintain a migration ledger,
resume tokens, idempotency, and rollback before plaintext retirement. If any
member lacks a device/key, pause rather than silently omit history. Review
whether previously removed members should receive any migrated history.

Never mix encrypted and plaintext items in one Box without explicit per-item
labels and access semantics. Do not market historical content as protected
before plaintext copies, derived thumbnails, exports, logs, and backups are
accounted for. Rehearse with disposable Boxes before any real-user migration.

## Delivery phases, gates, and estimate

| Phase                       | Deliverable                                                                                                           | Exit gate                                                                                           | Solo estimate |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------- |
| 0. Product and threat model | Scope, metadata inventory, recovery/history/deletion decisions, UX prototypes, protocol/library spike, review plan.   | Owner decisions and independent architecture review; MLS implementation feasible on target clients. | 3–5 weeks     |
| 1. Device identity          | Enrollment, key directory/transparency approach, verification UI, local storage, multi-device and recovery prototype. | Lost-device, malicious-key-substitution, reinstall tests; no server-held recovery secret.           | 5–7 weeks     |
| 2. Group service            | MLS delivery, ordered commits, Welcome, membership transitions, API contract and durable state.                       | Concurrent/offline join/remove tests; removed device cannot read future content.                    | 6–9 weeks     |
| 3. Content                  | Envelopes, post/comment/reaction/Life Update encryption and client rendering; feed/Memory/Room adaptations.           | Existing privacy and UX matrix plus cross-device golden vectors.                                    | 6–9 weeks     |
| 4. Media                    | On-device derivative generation, metadata stripping, encrypted variants, upload/download, immediate retirement.       | Hostile-image, leaked-URL, late-worker, and takedown tests.                                         | 4–6 weeks     |
| 5. Lifecycle/moderation     | Explicit report disclosure, staff evidence, local export, deletion semantics, support flows.                          | Phase 9 retention/appeal/deletion suites and user-facing copy reviewed.                             | 4–6 weeks     |
| 6. Pilot and audit          | Browser hardening, observability, load/cost tests, independent cryptographic/security review, fixes, opt-in pilot.    | Written review findings closed; hosted adversarial tests and rollback rehearsal.                    | 5–8 weeks     |
| 7. Existing Box migration   | Optional controlled client-side migration, reconciliation, plaintext retirement.                                      | Multiple real-device rehearsal migrations; rollback and backup policy accepted.                     | 4–7 weeks     |

For **new encrypted Boxes only**, phases 0–6 total **33–50 engineer-weeks**.
With roughly 20% contingency, budget **40–60 calendar weeks for one experienced
engineer**, or approximately **24–36 calendar weeks for a small specialist team**
with a dedicated reviewer. Existing-Box migration adds **4–7 engineer-weeks**
plus member coordination and backup-retention time. This estimate excludes
independent audit scheduling, native app builds, and a simultaneous Firebase
rewrite. Re-estimate after Phase 0; library suitability and recovery design
are the largest uncertainties.

Implement on one backend architecture first. If the Firebase rewrite proceeds,
finish its identity/data model decision before building E2EE's key directory
and delivery persistence, but design the crypto envelope to be backend-neutral.
Do **not** add the two plan estimates mechanically: some contract and deployment
work overlaps, while doing both at once increases integration risk. Sequence
the major migrations and keep signup closed until the relevant hosted abuse,
deletion, and appeal gates pass.

## Verification matrix and release criteria

Automated tests: standard protocol vectors; browser/native compatibility;
wrong Box/epoch/device, replay, reordered/duplicate messages; simultaneous
commits; key substitution; lost/recovered device; invite/leave/block/remove;
read after suspension; media object deletion and old URLs; content size and
malformed ciphertext; crash/retry between membership update and Commit;
client export; 90-day evidence retention; seven-day deletion cancellation;
browser XSS and plaintext leak scans. Use fault injection and at least three
physical devices/browser profiles in hosted staging. Measure latency for
joining, posting to a 20-member Box, multi-Box Life Updates, first decrypt,
and history sync; set budgets after Phase 0 benchmark.

Independent reviewers must inspect the threat model, selected MLS library and
version, identity binding, group-state persistence, attachment encryption,
recovery, web build trust, and migration. Publish user-facing limitations and
incident runbooks before an opt-in pilot. Do not change the global privacy
claim until the pilot, review, and migration state support it.

## References checked 2026-10-22

- [RFC 9420: Messaging Layer Security protocol](https://datatracker.ietf.org/doc/html/rfc9420)
- [RFC 9750: Messaging Layer Security architecture](https://www.rfc-editor.org/rfc/rfc9750.html)
- [Web Crypto API `CryptoKey` secure-context behavior](https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey)

Check the current protocol errata, implementation security advisories, client
support, and applicable policy immediately before Phase 0. This plan defines
integration work, not a new cryptographic primitive.
