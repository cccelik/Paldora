# Phase 7 Rooms — developer handoff

Rooms are authenticated user profiles. The application shell, relationship state, privacy indicator, overflow actions, and account controls stay outside `.room-canvas`; theme CSS must never cross that boundary.

## Responsive behavior

- Desktop uses the selected one-column or two-column widget layout. At 900px and below, every Room becomes one column without changing the persisted placement or order.
- The 390px view keeps a 44px minimum target for trusted actions, reduces the identity card and banner, and uses two-column photo tiles.
- Editor controls scroll independently on desktop. Mobile stacks controls before the live preview.

## Theme contract

- All themes render the same semantic component tree and are selected with `data-room-theme`.
- Only the five registry CSS variables and validated accent/background/font/decoration tokens may influence presentation.
- Content and controls use registry contrast pairs tested at WCAG AA. Motion stops under `prefers-reduced-motion`.
- PAL-101 and PAL-102 remain intentionally deferred: no arbitrary HTML, CSS, script, font URL, or background URL is accepted or stored.

## Privacy and content states

- Missing, blocked, and inaccessible Rooms share the same visual and API not-found state.
- Top Friends visibility is separate from Room visibility. Empty and filtered states contain no synthetic users.
- Post, Life Update, photo, and memory previews are derived per viewer and independently recheck Box membership and blocking.
- Music is an HTTPS link card only; there is no autoplay, scraping, or provider embed.

The deterministic source for the approved artboards is `/design-preview/phase-7`; regenerate them with `scripts/capture-phase7-designs.ts` while the development web server is running.
