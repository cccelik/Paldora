# Phase 9 plan: moderation and account lifecycle

Status: in progress. Phase 8 is delivered; public registration remains disabled. Scope follows [the rebuild plan](../rebuild-plan.md) and the authorization rules in [security.md](../security.md). This phase has no legacy implementation to copy.

## Outcome and boundaries

Members can report a user, post, comment, or Box. Authorized moderators can investigate a bounded queue, hide violating content, suspend accounts, and record a durable reason and actor for every action. Members can request a portable export and permanent account deletion. Public signup is enabled only after the moderation, deletion, and abuse gates pass in CI and the owner approves the operating model.

Do not add arbitrary admin SQL, a generic content-edit endpoint, public report counts, or public moderator identities. Reports are allegations, not automatic takedowns. Existing privacy rules still decide whether a reporter can identify the target. No Phase 8 custom CSS or widget source is shown in a moderation view without the same constrained renderer.

## Decisions for owner review

| Decision             | Recommended default                                                                                                                                                                                                | Needed before       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Moderator assignment | Explicit database role granted through an audited operator command; no email/domain allowlist and no self-promotion. Separate `moderator` and `admin` capabilities.                                                | Moderator endpoints |
| Report visibility    | Reporter sees only their own receipt and coarse status; the subject is never told who reported them. No public report counts.                                                                                      | Reporting UI        |
| Takedown             | Reversible `moderation_hidden` state with reason and actor, distinct from author deletion. A hidden target uses its existing not-found response for ordinary readers.                                              | Takedown            |
| Suspension           | Immediate API denial through the existing principal resolver, plus stream termination and web session handling; retain data pending review. No automatic Box ownership transfer.                                   | Suspension          |
| Deletion             | Reauthenticate, show irreversible effects, schedule a short cancellation window, then erase through an idempotent worker workflow. Legal retention exceptions, if any, need explicit policy before implementation. | Account deletion    |
| Export               | Private, expiring download containing the member's own data and authorized media, with an auditable request. Never include other members' private content merely because it appeared in a shared Box.              | Data export         |
| Signup               | Keep disabled until queue staffing, abuse limits, appeal/contact path, and deletion/export operations are demonstrated on a hosted environment.                                                                    | Public signup       |

The owner chose a **7-day cancellation window** before account erasure,
**90 days after case closure** as the default evidence-retention period
(subject to any specific legal duty), and **immediate object retirement** for
moderator takedowns. Restoring retired media requires a new upload.

## Data and contract

Add reviewed, forward-only migrations after `0008` for `user_reports`, `moderation_actions`, `moderation_cases` or a queue projection, account deletion requests, and export requests. Use constrained target kinds and statuses, database checks and foreign keys where they preserve history, immutable action rows, actor/target/time indexes, and idempotency keys. A report snapshots only the minimum evidence needed for review; it must not become a second public content store. Define retention and purge rules before storing IP addresses, free-text allegations, or deleted content. Suspension can use the existing `users.status='suspended'`; deletion must define when `deleted` becomes terminal.

Every new route gets a Zod request/response schema, typed client method, generated OpenAPI entry, fixture, explicit rate-limit decision, and authorization tests. Initial surface:

| Surface                                              | Actor                                       | Result                                                                |
| ---------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| `POST /reports`                                      | Signed-in member with current target access | Receipt with opaque report ID; no target existence leak               |
| `GET /me/reports`                                    | Reporter                                    | Their receipts and coarse status only                                 |
| `GET /moderation/cases`, `GET /moderation/cases/:id` | Moderator                                   | Minimal evidence under a dedicated role guard; access logged          |
| `POST /moderation/cases/:id/actions`                 | Moderator                                   | Idempotent hide, restore, suspend, or unsuspend with mandatory reason |
| `POST /me/export`, `GET /me/export`                  | Account owner                               | Private asynchronous export status and short-lived download           |
| `POST /me/deletion`, `DELETE /me/deletion`           | Reauthenticated owner                       | Request or cancel within the published window                         |

Keep admin account lookup separate from public profile lookup. Search should require a specific identifier, return minimal fields, be rate limited, and write an audit event even when no account is found. The exact endpoint shape and evidence-retention periods are design decisions in the first slice.

## Authorization matrix to implement and test

| Case                                              | Reporter or ordinary viewer                                                                    | Target owner                                                   | Moderator                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Accessible active target                          | Can report once per policy window; normal read rules apply                                     | Can edit/delete own content                                    | Can inspect a case and act with reason                       |
| Guessed UUID, deleted target, or inaccessible Box | Same non-leaking absence as the existing target route; no report receipt                       | Existing absence behavior                                      | Case lookup only if a case already exists                    |
| Block in either direction                         | `hiddenByBlock`/`isBlockedBetween` decide access; no report-based existence oracle             | No reporter identity                                           | Evidence is visible only through the case role               |
| Unfriend, leave/remove, archive, or Box delete    | Recheck access at report submission and every ordinary read                                    | Existing lifecycle policy                                      | Preserve minimal case history; never restore deleted content |
| Moderation-hidden target                          | Existing not-found response for ordinary reads, including media and Room previews              | Clear owner notice and appeal path, with edit policy specified | Can restore only if the underlying item remains live         |
| Suspended account                                 | API guard denies new calls; SSE closes; owner cannot publish or export through ordinary routes | No active session capabilities                                 | Can review and unsuspend through audited action              |
| Account deletion                                  | No content or media leak through feeds, notifications, search, or cached links                 | Cancellation only during window                                | Audit survives only under the approved retention policy      |

The final implementation matrix must cover each target kind separately, both block directions, guessed identifiers, concurrent takedown/delete, former Box membership, and suspended subjects. No ordinary response may reveal a moderator's evidence or another reporter's identity.

## Sequential slices and gates

1. **Policy and migration.** Decide role assignment, evidence retention, appeal, deletion window, and export format. Write a threat model and ADR. Add schema and migration, role guard, immutable audit writer, and DB tests. Review migration SQL manually; never edit `0000`–`0008`.
2. **Reports and queue.** Add target-specific policy checks, report dedupe and rate limits, case reads, admin lookup, contract/client, and integration tests. Test that forged UUIDs, blocks, and revoked Box access reveal nothing.
3. **Takedown and suspension.** Centralize moderation-hidden checks in each read and signed-media path; preserve author deletion semantics. Make suspension terminate SSE and prevent new requests, including Room writes and media completion. Test concurrent actions and restore.
4. **Export and deletion.** Implement an idempotent workflow with restart/retry tests. Null `rooms.banner_media_id` and retire the banner through the media outbox before user removal; `media_assets.owner_user_id` is `RESTRICT`. Walk all owned and shared references, generated derivatives, notifications, outboxes, Room widgets, and backup/retention obligations. Export only owned/authorized data through a private expiring artifact.
5. **Web, operations, and signup gate.** Ship member reporting and account controls, a responsive accessible moderator console, runbooks, abuse metrics, and end-to-end tests. Public signup remains off until the hosted smoke, abuse, suspension, export, and deletion checks pass and the owner approves activation.

Each slice ends with formatting, lint, types, unit, contract, token, build, bundle scan, integration, signed-out and signed-in browser gates green before a direct-to-`main` commit. Include desktop and 390px tests, accessibility, and a CI run. Do not start native clients until Phase 9 is stable for a release, as the rebuild plan requires.

## First executable step

Draft the Phase 9 threat model and ADR for moderator authority, evidence retention, immutable audit, and deletion semantics. Inventory every content read and signed-media path before adding a `moderation_hidden` check, and enumerate all user-owned foreign keys and outbox references before designing deletion. That inventory decides the migration and prevents a superficial takedown that leaves a media or realtime leak.

Open but independent owner sign-offs: ADR 017 K4 theme colors and Phase 7 defaults, D5 production hosting, and eventual `legacy/` retirement. D5 becomes a dependency for the hosted signup gate.
