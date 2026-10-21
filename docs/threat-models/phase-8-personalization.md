# Phase 8 personalization threat model

Status: design for review, 2026-10-21. No implementation or security sign-off.
Related: [plan](../plans/phase-8-advanced-personalization.md),
[ADR 018](../adr/018-room-personalization-boundaries.md),
[security invariants](../security.md).

## Assets and boundaries

Protect session cookies and bearer tokens, private content and relationships,
signed media URLs, trusted controls, availability, and the visitor's device.
A Room owner is an untrusted author, including to their friends. Attackers also
include unrelated authenticated viewers, former members, and blocked accounts.

Boundaries: author input → parser/canonicalizer → database → authorization →
stylesheet renderer or isolated widget response → browser. Customized content
never enters trusted navigation or the customizer's control tree. Content
visibility still comes from the ordinary API, not customization configuration.

## Threats, proposed controls, and review evidence

| Threat                                              | Proposed control                                                                                                                                                                                                          | Required evidence                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| CSS escapes scope or spoofs trusted UI              | Closed selectors rooted by the server to a dedicated Room surface; forbid fixed/sticky positioning, transforms, negative spacing, z-index, generated content, interaction changes, and properties not explicitly approved | Hostile selectors and values cannot affect any trusted control; screenshots and hit tests           |
| CSS leaks data through requests or selectors        | No URLs, imports, font faces, external resources, arbitrary custom properties, attribute selectors, `:has`, or input-sensitive pseudo-classes; parse and regenerate, never regex-sanitize                                 | Network interception records zero author-controlled requests; escaped and nested syntax corpus      |
| HTML executes or navigates                          | Text-only allowlist; reject executable/interactive tags and all URL/event/style attributes; separate cookieless origin; iframe `sandbox=""`; no capability tokens                                                         | Parser mutation corpus, direct-navigation tests, origin and sandbox assertions in all three engines |
| Sanitizer or browser parser differential            | Canonical AST output, versioned policy, bounded depth/nodes/bytes, reject unknown syntax                                                                                                                                  | Round-trip and malformed-input corpus, dependency review and upgrade regression tests               |
| Widget accesses app credentials                     | Never send tokens/cookies/private content to its origin; no same-origin relaxation, scripts, messaging bridge, or shared storage                                                                                          | Request/header audit; parent/child access and storage attempts fail                                 |
| Artifact leaks an inaccessible Room                 | Shared Room access check on every request, no-store and no shared cache, source owner-only                                                                                                                                | Byte-equivalent denial matrix for Room and artifact endpoints; relationship revocation tests        |
| Denial of service                                   | Strict input/output/rule/node bounds, parser-work budget, bounded count and rendering dimensions, no animations or active content initially                                                                               | Worst-case parsing/rendering fixtures; limits and rate failures leave no rows                       |
| Old policy or stale writes resurrect unsafe content | Policy versions, fail-closed fallback, optimistic writes, independent kill switches                                                                                                                                       | Policy invalidation, rollback, concurrency, and disable/re-enable tests                             |
| Deletion leaves personal data or media              | FK/lifecycle design and durable cleanup; no customization snapshots in feeds or notifications                                                                                                                             | Account/Room deletion tests, including banner retirement before user deletion                       |
| Author makes content inaccessible or deceptive      | Restricted typography/contrast and layout grammar, constrained widget container, accessible title and fallback                                                                                                            | Axe, keyboard and screen-reader review, reduced motion, zoom and 390px checks                       |

## Proposed browser delivery

Do not relax the app's existing no-inline-style CSP. CSS needs an authenticated,
non-cacheable stylesheet response with the exact content type, nosniff, and no
redirect to an attacker origin. The CSS source can never inspect forms or
trusted controls. The final selector/property/value allowlist is a review
artifact, not delegated to a generic CSS sanitizer.

A dedicated widget origin is a prerequisite, not a hostname chosen in this
plan. It must have no application cookies, credentials, or private state.
The iframe has an accessible title, fixed bounded layout, no referrer, an empty
sandbox, and no scripts, same-origin privilege, forms, popups, downloads,
navigation capability, or fullscreen. Its response policy starts at
`default-src 'none'`, forbids scripts and connections, and restricts embedding
to the configured app origin. Any trusted presentation stylesheet must be
explicitly reviewed without author-controlled resources or a broad CSP exception.
There is no widget JavaScript, including resize helpers or third-party embeds.

Isolation is layered: sanitization does not replace sandboxing; sandboxing does
not replace authorization, resource limits, or CSP. A kill switch restores the
token-only surface without deleting the owner's draft. Nothing can retract
bytes already read or screenshots saved by an authorized viewer.

## Unresolved widget transport boundary

The proposed cookieless origin cannot receive app credentials and independently
perform the current viewer check at the same time. This is a blocker for the
widget design, not a reason to publish artifacts or put tokens in URLs. Review
must resolve either authorized parent retrieval plus opaque sandboxed `srcdoc`
(with inherited-CSP tests and no directly navigable HTML endpoint), or a proven
isolated-origin protocol. No transport or frame-source policy is approved here.
Existing app script/style restrictions must stay intact; any later frame-source
extension needs specific approval. CSS-first review can proceed independently.

## Dedicated security review gate

Before either surface is built, name the reviewer, review the exact allowlists
and dependency versions, resolve the threat rows, and record approval scope and
residual risks. A plan approval alone does not close this review. Before release,
attach the three-engine abuse-test evidence and verify deployed origin, cookie,
cache, MIME, CSP, and sandbox headers. No reviewer or approval is recorded yet.

## Primary references checked 2026-10-21

- [WHATWG HTML: iframe sandbox](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox)
  defines the sandbox restrictions and capability tokens; the proposal requests
  no relaxation tokens.
- [W3C Content Security Policy Level 3](https://www.w3.org/TR/CSP3/), a working
  draft, defines fetch/execution policy and response policy delivery. Browser
  behavior must still be verified by the release tests.

These references inform the proposed controls; they do not establish that
Paldora's future implementation is secure.
