# ADR 018: Review-gated Room personalization boundaries

Status: proposed (2026-10-21), awaiting owner approval and dedicated security
review. No implementation or migration accompanies this ADR.

## Context

Phase 7 Rooms use token-only themes and a closed widget registry. Phase 8 would
introduce author-controlled CSS and HTML, adding stored-content, UI deception,
network exfiltration, browser isolation, and availability risks. Arbitrary
JavaScript is permanently prohibited by the product's security invariants.

## Proposed decision

Review and deliver constrained CSS before separately reviewed static widgets.
Use a closed, bounded, versioned CSS grammar with server-generated scope and
canonical output; reject unknown syntax and every author-controlled network
resource. Preserve the application's CSP and keep trusted controls outside the
customized surface. Owner writes remain optimistic and API-authorized.

Widgets initially accept only bounded text-oriented markup, rendered on a
separate cookieless origin with an empty iframe sandbox, restrictive response
CSP, no referrer, and no active content, messaging, links, or media. The origin
and exact HTML allowlist require their own approval and security review. Room
access is checked for every artifact; editable source is owner-only. Private
no-store delivery, policy-version invalidation, and independent kill switches
are requirements. Token presets remain the fallback.

The [plan](../plans/phase-8-advanced-personalization.md) and
[threat model](../threat-models/phase-8-personalization.md) define the proposed
matrix, limits, tests, and review evidence. Nothing changes deployed migrations,
existing privacy responses, signed-media access, or the signup gate.

Authenticated delivery to a credential-free widget origin is unresolved. The
review must prove either authorized parent retrieval with opaque sandboxed
`srcdoc` and no directly navigable HTML endpoint, or an isolated-origin
protocol. No public artifact, URL token, or credential relaxation is an accepted
workaround. Widget implementation remains blocked on that review; the first
recommended owner decision is CSS-first design/review only.

## Alternatives

- Arbitrary JavaScript: permanently rejected, not an option for later approval.
- Raw CSS with selector prefixing alone: insufficiently constrained for review.
- Raw HTML or same-origin unsandboxed widgets: exposes the trusted application
  boundary to author content.
- Relying only on a sanitizer or CSP: omits independent authorization, isolation,
  containment, and resource controls.
- Token presets only: safest fallback and a valid owner choice to defer Phase 8.

## Consequences and revisit triggers

Less expressive than general CSS/HTML; more parser, policy-version, browser-test,
and hosting maintenance. No implementation starts before owner approval and the
relevant dedicated security review. New properties, tags, attributes, resources,
capability tokens, or origins require a new review. Revisit if safe delivery
would require weakening the application CSP; retain token-only Rooms instead.
