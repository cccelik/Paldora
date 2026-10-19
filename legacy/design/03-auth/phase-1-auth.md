# Phase 1 authentication and profile handoff

## Routes

- `/sign-in`, `/forgot-password`, `/reset-password`
- `/onboarding/username`, `/onboarding/profile`, `/onboarding/avatar`
- `/home`, `/settings/account`

Public account creation, email verification, magic links, social providers, and the later onboarding steps are intentionally absent from this milestone.

## Responsive behavior

Desktop authentication uses a two-panel composition: a dark editorial brand story and a focused cream form panel. Below 820px the story panel is removed, the wordmark remains, and the form becomes a single 390px-friendly column. Signed-in pages use the trusted dark shell and switch from the left rail to a fixed five-item bottom bar below 820px.

Controls have a minimum 44px target, a lavender focus ring, persistent text labels, and inline status copy. Gold is reserved for the primary action. Cream surfaces, black editorial headings, and quiet paper texture carry the brand without competing with form completion.

## States and behavior

- Sign-in exposes loading and generic invalid-credential messages without revealing whether an email exists.
- Password recovery always returns the same success copy; reset handles invalid or expired callbacks.
- Username availability is advisory. The API and PostgreSQL unique index remain authoritative.
- Avatar accepts JPEG, PNG, or WebP up to 10 MB, shows upload/storage failures inline, and permits onboarding to be skipped.
- Settings supports profile edits, avatar replacement/removal, reset-password navigation, and sign-out. Email is read-only for Phase 1.
- `/home` is deliberately empty until Boxes and feed milestones exist.

## Artboard generation

The AI-generated `phase-1-auth-reference.png` established the visual direction. All individual Phase 1 artboards are deterministic browser captures from the implemented components using `pnpm design:capture:phase1`; the capture-only preview route returns 404 in production.
