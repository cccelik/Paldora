# ADR 024: Hearth & Brass v2 tokens

Status: accepted (owner instruction, 2026-11-07). Supersedes the palette and
type choices in ADR 005 and `legacy/design/design-system.md` (Obsidian Ink,
Antique Gold, Champagne, Warm Ivory, Soft Lavender; Cormorant, Newsreader,
Inter). ADR 005's pipeline (one DTCG source, generated outputs, drift check,
contrast tests) is unchanged.

## Context

The owner approved a new design kit, "Hearth & Brass" (Figma file
`RAZq5RS2gSwVa4xvxbk0gZ`, page 01 Foundations). The plan is in
[docs/plans/ui-overhaul.md](../plans/ui-overhaul.md); this ADR records the
token decisions.

## Decision

- **Source.** `design/tokens/paldora.tokens.json` keeps the semantic Light
  and Dark trees `theme.light.*` / `theme.dark.*`, now named like the Figma
  variables: `bg/{canvas,surface,sunken,inverse,inverse-raised,paper}`,
  `text/{primary,secondary,muted,on-inverse}`, `border/hairline`,
  `accent/{brass,brass-text,brass-soft,ember,ember-soft,sage,sage-soft}`,
  `action/{primary,on-primary}`, `focus/ring`, `status/{danger,success}`,
  `nav/{active,on-active}`. Dark is a mode, not a second palette. Values were
  verified against the Figma variables (`get_variable_defs`) on 2026-11-07:
  no differences from the plan.
- **One addition.** `accent/on-brass` (`#1D1A17` in both modes) is text on a
  brass fill. It is not in the Figma file; it replaces the old `onAccent`.
- **Other tokens.** 15 text styles (`type.*`), spacing 4 to 80, radius
  sm 8, md 16, lg 24, xl 28, sheet 30, pill 999, elevation Soft and Lift,
  motion (120, 200, 320 ms; `cubic-bezier(0.2, 0.8, 0.2, 1)`), layout
  constants (iPhone 402 by 874, tab bar 370 by 64, web sidebar 264,
  breakpoints 390, 768, 1024, 1280, 1440) and icon metrics (24 px grid, 1.6
  stroke, 1.8 active).
- **Fonts.** Fraunces (display), Geist (UI), Geist Mono (code, IDs), all SIL
  OFL 1.1, self-hosted: web via `next/font/local` (CSP stays `font-src
'self'`), iOS as bundled TTFs registered through `UIAppFonts` with a
  system-font fallback (`PaldoraFont`). See `THIRD_PARTY_NOTICES.md`.
- **Compatibility.** The pre-v2 web custom properties (`--pal-canvas`,
  `--pal-surface`, `--pal-text`, `--pal-accent`, `--pal-accent-text`,
  `--pal-highlight`, `--pal-success-text`, `--pal-warning-text`,
  `--pal-danger-text`, `--pal-focus`, `--pal-on-accent`) remain as
  deprecated aliases (`deprecated.*` in the source, web CSS only) mapped to the
  closest v2 token. Native code was migrated, not aliased. Remove the aliases
  when the web screens are rebuilt (plan step 3).
- **Room themes.** The 14 presets, 8 accents and their values already match
  Figma page 07; unchanged. `room.font.editorial` stays a system serif stack
  (ADR 017: Room fonts are system stacks), no longer tied to `font.editorial`.
- **Contrast.** `design/tokens/contrast-pairs.json` now lists the used
  pairs in both modes. One Figma value misses AA: `text/muted` (see below).

## Known shortfall

`text/muted` (`#8C8276` Light, `#908574` Dark) is 3.29:1 on canvas, 3.56:1 on
surface and 2.93:1 on sunken in Light, and 4.35:1 on sunken in Dark. It is kept
as designed and pinned in `exceptions` of the contrast file (floor and
"below 4.5" both asserted). It is for large text, icons and decoration only.
The existing web and iOS views that used the old `textMuted` for small text now
use `text/secondary` (4.5:1 or better) until their screens are rebuilt.

## Alternatives rejected

- Silently darkening `text/muted`: the kit is the owner's; report instead.
- A second palette for web: native and web must share values (ADR 005).
- Variable-font axes beyond weight and optical size for web: Fraunces is
  pinned to SOFT 0, WONK 1 as in Figma; the Light/Regular range is 300 to 500.

## Revisit when

Figma changes `text/muted`, or the web screens no longer use any deprecated
alias.
