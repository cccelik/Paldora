# Phase 8: advanced Room personalization

Status: proposed, awaiting owner approval and dedicated security review.
No implementation, migration, contract change, or CSP change is authorized by
this document. Arbitrary JavaScript remains permanently prohibited.

## A. Scope

Optional scoped CSS and static sandboxed HTML widgets on Rooms. Existing token
presets remain the default and fallback. Trusted navigation, privacy controls,
account actions, and the customizer remain outside the customized surface.
Public registration remains disabled. Phase 9 and native apps are not started.

## B. Owner decisions (recommended defaults)

| Decision        | Recommended default                                                                                              | Approval required          |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Delivery order  | Review and implement constrained CSS first; review static widgets separately                                     | Yes                        |
| CSS language    | Closed selector/property/value grammar, parsed into a canonical AST; reject unsupported input                    | Yes                        |
| Widget language | Text-oriented HTML only; no links, media, SVG, MathML, forms, script, or user CSS in the first version           | Yes                        |
| Isolation       | Dedicated cookieless widget origin, empty iframe sandbox, restrictive response CSP; no sandbox capability tokens | Yes; hosting depends on D5 |
| Privacy         | Same Room authorization for every artifact; no public or capability URLs                                         | Yes                        |
| Availability    | Feature flag off by default; independent kill switches; retain token-only fallback                               | Yes                        |
| Review          | Named security reviewer and browser abuse-test evidence before implementation of each surface                    | Yes                        |

Approval of this plan is not approval of a parser package, production hosting,
a migration, or a wider HTML/CSS allowlist. Exact allowlists and dependencies
must be reviewed before their implementation slice.

## C. Data model (proposal only)

New forward-only migration after 0007, reviewed separately. A one-to-one
`room_customizations` row stores owner, optimistic version, policy version,
bounded CSS source and canonical output. Separate widget rows store owner,
position, sanitized markup, and policy version. Foreign keys tie ownership to
the Room; size, count, position, and version constraints are final authority.
No arbitrary storage keys, third-party URLs, executable payload columns, or
copied posts. Validate and compile outside transactions; persist canonical
results and version checks atomically. No network I/O in an open transaction.

Start limits for review: CSS 8 KiB / 64 rules / 256 declarations; at most three
widgets, each 8 KiB / 128 nodes / depth 8. Both input and output are bounded.
Expired policy versions fail closed to the token-only Room until revalidated.
Account deletion must erase customization data; Phase 9 must still retire Room
banners before removing users because media ownership is RESTRICT.

## D. Authorization matrix

| Action or situation                             | Proposed behavior                                                                             |
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

## E. Contract and rate-limit decisions (not added yet)

Candidate owner endpoints: get/replace/delete customization and create/replace/
delete widget under `/me/room`. Candidate authenticated artifact reads resolve
the Room first, then the requested owned artifact. Final route shapes and MIME
handling require review; no routes are registered in this proposal.

Owner writes should share the existing fail-closed Room write budget, with
additional bounded parser-work limits. Artifact reads need an explicit abusive
fetch decision and edge limits; denial paths use the same policy. Every eventual
route needs Zod schemas, typed client methods, generated OpenAPI, route-inventory
coverage, fixtures, and integration/authorization tests.

### Widget transport is an explicit review blocker

A cookieless host cannot independently run the app's normal cookie-based
viewer authorization. Do not bridge this with public objects, tokens in URLs,
or relaxed cross-origin credentials. Before approving widgets, the reviewer
must choose and prove an authenticated transport: for example, sanitized markup
loaded through the authorized parent and rendered as opaque sandboxed `srcdoc`,
or a separately reviewed isolated-origin protocol. `srcdoc` would require
verification of inherited CSP and no directly navigable HTML artifact. This
proposal intentionally does not claim that the widget transport is solved.
The recommended first approval covers CSS design/review only.

## F. Sequential slices after approval

1. Dedicated CSS security review: exact grammar, parser dependencies, selector
   rewrite proof, network and containment corpus; resolve findings first.
2. Reviewed database migration and API policy/contract/authorization tests.
3. Web editor and authorized stylesheet delivery without inline styles or weaker script/style restrictions; complete desktop/390px and adversarial tests.
4. Independent widget security review and authenticated delivery/origin decision, then a new
   database/API/web slice. No implementation by analogy with CSS approval.
5. Kill-switch, fallback, deletion, documentation, and release review.

Each implementation slice ends with every repository gate green and a commit.
Integration runs only through the dedicated test-database wrapper. Public signup
stays closed. Phase 9 begins only after this phase is explicitly resolved.

## G. Tests and risks

The [threat model](../threat-models/phase-8-personalization.md) is the review
checklist. Test all matrix rows, both block directions, guesses, parity headers,
cache headers, no network requests from hostile content, stored/reflected XSS,
CSS escapes and parser differentials, containment and trusted-control overlap,
resource limits, policy upgrades, stale saves, kill switches, accessibility,
keyboard use, reduced motion, and 390px/desktop layout. Cover Chromium, Firefox,
and WebKit for security-sensitive behavior before enabling the feature.

Main risks: CSS exfiltration and UI deception, iframe navigation and origin
mistakes, parser bypasses, inaccessible author styling, expensive input, and
artifact caching after relationship changes. Dedicated review has not happened;
there is no security approval or implementation readiness claim.
