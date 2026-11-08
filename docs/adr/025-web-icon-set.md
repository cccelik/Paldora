# ADR 025: Web icon set

Status: accepted (owner instruction, 2026-11-08).

## Context

The web `Icon` was a set of hand-drawn SVG paths, and a few screens used text
glyphs as icons (arrows in back links and Room reorder buttons). Owner
requirement: proper, meaningful symbols like iOS SF Symbols.

## Decision

- SF Symbols may not be used on the web: Apple's licence restricts them to
  apps for Apple platforms. iOS keeps SF Symbols.
- Use [Lucide](https://lucide.dev) (ISC licence) through `lucide-react`,
  pinned exactly at 1.61.0 (published 2026-10-21, over two weeks old when
  added). Named imports only, so unused icons tree-shake; 56 icons measured
  about 6.8 KB gzip. No hooks or browser APIs, so the icons work in Server
  Components.
- `ui/icons.tsx` stays the single owner and keeps the `Icon` API
  (`name`, `size`, `active`, `title`). Names match the iOS `PaldoraIcon` cases.
  Stroke is 1.6, 1.8 when active. `spark` stays a brand shape.
- The icon-to-Lucide table is in `apps/web/app/components/README.md`.

## Rejected alternatives

- Hand-drawn paths: inconsistent optical weight and meaning, high upkeep.
- Phosphor: good coverage, but six weights add surface we do not use and its
  React package is larger to audit; Lucide's single outline style matches SF
  Symbols' regular weight best.
- Heroicons: a smaller set (no armchair, history, flag variants for report) and
  fixed 1.5 stroke without a prop.

## Revisit when

Lucide drops or renames a mapped icon, the design kit adopts a custom icon
set, or the bundle cost becomes a measured problem.
