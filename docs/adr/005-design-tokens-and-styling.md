# ADR 005: One token source; CSS Modules for web styling

Status: accepted (2026-10-18). Implements R7. Decisions D3 (styling) and D7
(accessible text variants) confirmed by the owner on 2026-10-18.

## Context

The legacy build had three token sets with different hex values:
`design-system.md`, `packages/ui`, and a 3,796-line `globals.css` that also
imported Tailwind but barely used it. Native apps need identical values.

## Decision

- **Single source.** `design/tokens/paldora.tokens.json` uses the W3C DTCG
  format. Brand primitives are copied verbatim from
  `legacy/design/design-system.md`. The semantic `theme.light.*` and
  `theme.dark.*` tokens alias them.
- **Generated outputs.** `pnpm tokens:generate` writes:
  - CSS custom properties (`--pal-*`). Light/dark switches by
    `data-appearance` or `prefers-color-scheme`.
  - A TypeScript map.
  - Raw Swift and Kotlin constants.
  - CI fails on drift.
- **Contrast checks.** `design/tokens/contrast-pairs.json` declares
  foreground/background pairs, and tests enforce WCAG 2.2 AA (4.5:1 text,
  3:1 non-text).
- **Accessible text variants (approved as D7).** Three documented "readable
  text" colors fail AA on the light surfaces. I added darker variants with
  the same hue and used them for semantic text:

  | Color     | Documented value | Contrast | Accessible variant |
  | --------- | ---------------- | -------: | ------------------ |
  | Deep Gold | `#9C7424`        |     3.97 | `#88651F`          |
  | success   | `#668060`        |     4.07 | `#5B7255`          |
  | warning   | `#A96F2D`        |     3.92 | `#936127`          |

- **Styling.** The web app uses co-located CSS Modules that read only
  `--pal-*` variables. There is no Tailwind and no `style` attributes,
  because production CSP forbids inline styles.

## Alternatives rejected

- **Tailwind.** It duplicates the token source, and legacy usage was
  half-hearted.
- **CSS-in-JS.** It needs runtime style injection, which conflicts with the
  strict CSP.
- **Style Dictionary.** A heavy dependency for a 60-line generator.

## Revisit when

Room themes (Phase 7) need token sets per theme. Extend the same pipeline
rather than adding a second one.
