# Phase 8: advanced Room personalization

Status: implementation authorized by the owner (“implement 8”), 2026-10-21.
Release verification is in progress. Both production flags default off.
Arbitrary JavaScript remains permanently prohibited. Phases 9–12 and public
registration remain unstarted/disabled.

## Reviewed scope

Constrained Room typography and up to three static text widgets. Trusted
navigation, account actions, privacy controls and editor forms stay outside the
customized canvas. Token presets remain the default and fallback.

The [dedicated implementation review](../threat-models/phase-8-security-review.md)
records separate CSS and HTML reviews, exact allowlists, pinned parsers and the
transport decision. Codex performed this review; it is not an external audit.
The [threat model](../threat-models/phase-8-personalization.md) and
[ADR 018](../adr/018-room-personalization-boundaries.md) record boundaries.

## Data and contracts

Forward-only migration 0008 adds Room-owned customization and widget source
rows. PostgreSQL enforces UTF-8 byte bounds, policy versions, widget positions
0–2, title lengths and cascading Room ownership. Source is stored once and
recompiled on every rendered read. Unsupported policy versions and invalid
stored content fail closed. No artifact storage objects, snapshots or public
HTML URLs exist. Phase 9 must still retire Room banners before user deletion.

Owner routes: GET and PUT `/me/room/personalization`. PUT replaces CSS and the
ordered widget list; empty CSS/list removes them. Shared Room optimistic version
and 120/hour write budget apply. Compilation happens before the transaction;
there is no network I/O in the transaction. Disabled surfaces cannot change.
Owner source retrieval remains available for recovery while a flag is off.

GET `/rooms/{username}/personalization` reauthorizes through RoomAccessService,
then returns only scoped CSS and sandbox documents. Reads follow the existing
unlimited Room GET policy; bounded sources limit per-request compiler work.
All responses are private/no-store. Malformed, missing, hidden, blocked and
unavailable owners retain indistinguishable denial behavior. Friendship,
current shared Box membership, archive, leave, removal, deletion and suspension
use existing Room access rules. Source never appears in visitor DTOs.

## Authorization matrix

| Action or situation                             | Enforced behavior                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Create, update, delete                          | Active, onboarded owner only under `/me/room`; stale saves fail without overwriting           |
| Read rendered CSS or widget                     | Current viewer must pass `RoomAccessService`; reading never expands content access            |
| Read raw editable source                        | Owner only; never part of the visitor Room DTO                                                |
| Guessed owner/widget UUID or malformed username | Same status, body, and relevant headers as inaccessible/missing Room; no existence/count hint |
| Block in either direction                       | `ROOM_NOT_FOUND` for Room and every artifact; use shared block conditions                     |
| Unfriend                                        | Friends-only access ends; members access survives only with a currently shared Box            |
| Leave/removal/deleted Box                       | That relationship stops authorizing immediately; independent valid relationships still apply  |
| Archived shared Box                             | Existing Room members semantics remain; archival does not create a new audience               |
| Hidden Room                                     | Owner only; visitors and artifacts all indistinguishable from missing                         |
| Room/account deletion                           | Artifacts inaccessible immediately; durable cleanup removes stored data                       |
| Suspension                                      | Writer fails in the auth guard; suspended owner and their artifacts answer `ROOM_NOT_FOUND`   |
| Unblock                                         | Restore only access independently allowed now; no friendship restoration                      |

Read-time authorization is required on every artifact request. Already delivered
bytes cannot be recalled from a viewer; no promise of remote erasure is made.
Artifacts use private/no-store responses, no CDN/service-worker persistence,
no shared signed public URLs, no bearer tokens in paths or query strings, and
no source/markup/token/signed-URL logging.

Writes accept no owner or widget UUID: the authenticated principal is always
the owner. Unknown body fields are rejected by the strict schema; invented
artifact/source routes are ordinary 404s and cannot select another owner.

## Browser delivery

The same-origin authenticated stylesheet route reauthorizes on every fetch,
returns CSS MIME with nosniff/private/no-store and no credential-bearing URL.
The parent retrieves widgets through the authorized API and renders opaque
`sandbox=""` srcdoc iframes. Each child document has a resource-denying CSP,
no referrer and no scripts, forms, links, media, attributes or messaging bridge.
No new hosting dependency or relaxed parent CSP is required.

The editor supports adding, deleting and reordering widgets, clearing CSS,
validation feedback and the shared stale-save lock. It uses existing form
primitives and generated tokens, with no inline styles.

## Verification and release

`pnpm test:e2e:personalization` runs the production stack against the isolated
test database in Chromium, Firefox and WebKit (390px). The same scenarios also
run in the full signed-in Chromium desktop/390px suite. Tests include deliberate
compiler bypass in a browser fixture to check independent sandbox/CSP defenses.
CI runs both suites. Compiler abuse, current authorization, policy fallback,
kill switches, constraints, cascades and stale saves have dedicated tests.

Both `ROOM_CUSTOM_CSS_ENABLED` and `ROOM_CUSTOM_WIDGETS_ENABLED` default false.
Enable independently only after reviewing recorded gate/browser evidence and
performing deployment smoke checks. To roll back, turn off the affected flag;
stored source remains owner-recoverable while visitors see the token Room.
Broader selectors, properties, tags, attributes, resources or iframe capabilities
require a new review and policy version. No arbitrary JavaScript, ever.
