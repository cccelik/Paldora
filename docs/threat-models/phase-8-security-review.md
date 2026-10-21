# Phase 8 implementation security review

Reviewer: Codex, 2026-10-21. This is an implementation review, not an independent
external audit. Owner authorization: “implement 8”. Production activation remains
separate from implementation; both kill switches default off.

CSS and HTML were reviewed separately before implementation. CSS uses PostCSS
8.5.31 and HTML uses parse5 8.0.1. The closed CSS language permits only exact
`.room-title`, `.room-card`, `.room-text` selectors and finite typography values:
font-weight 400/500/600/700; font-style normal/italic; text-align left/center/right;
line-height 1.4/1.5/1.6/1.8; letter-spacing 0/0.02em/0.05em/0.1em. No colors,
geometry, URLs, functions, custom properties, interaction, at-rules or nesting.
Selectors become server-owned UUID scoped descendants of the Room canvas.
Compilation uses a parsed AST, rejects unsupported nodes and emits canonical
strings. CSS cannot target trusted controls or create overlays.

Widgets permit p, h2, h3, span, strong, em, ul, ol, li, br, blockquote, pre, code.
All attributes, comments, foreign namespaces and other tags are rejected. Text
is escaped and elements are serialized from the validated tree. Limits: 8 KiB
UTF-8 per source, 128 nodes, depth 8; CSS 64 rules / 256 declarations. Revalidate
persisted sources at every read; unknown policy versions fail closed.

Transport decision: the authenticated parent retrieves authorized widget bytes;
there is no public HTML endpoint or object URL. An empty sandbox on srcdoc makes
the child opaque and disables script, navigation capabilities, forms and popups.
A child meta CSP denies every resource type and base/form targets. No sandbox
capabilities, postMessage protocol, resize script, credentials or relaxed parent
script policy. Parent authorization always uses RoomAccessService. No raw source
in visitor DTOs. Source reads are owner-only. All responses private/no-store.

Writes share the existing Room write budget and optimistic version lock. Parser
work occurs before the transaction; no network I/O in transactions. Constraints
bound persisted source sizes and widget positions; cascading ownership erases
customizations with Rooms. Kill switches affect reads and writes independently.
Disabled or obsolete customization leaves the token Room usable.

Required release evidence: compiler abuse corpus, authorization matrix, stale
save and database constraints, browser sandbox/network/containment checks in
Chromium, Firefox and WebKit, 390px accessibility, full repository gates. Do not
enable either production flag until that evidence is recorded. Broader grammar
requires another review and policy version.

References: [HTML sandbox](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox),
[PostCSS](https://github.com/postcss/postcss), [parse5](https://github.com/inikulin/parse5).
