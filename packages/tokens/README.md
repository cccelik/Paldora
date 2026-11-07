# @paldora/tokens

Design tokens generated from `design/tokens/paldora.tokens.json` (W3C DTCG)
by `pnpm tokens:generate`. `pnpm tokens:check` byte-compares the committed
outputs and fails on drift. See ADR 005.

Palette and type: Hearth & Brass v2 ([ADR 024](../../docs/adr/024-hearth-and-brass-v2-tokens.md)).

## Source layout

- `theme.light.*` / `theme.dark.*`: semantic colors named like the Figma
  variables (`bg.canvas`, `text.primary`, `border.hairline`, `accent.brass`,
  `action.primary`, `focus.ring`, `status.danger`, `nav.active`, ...). Both
  modes must have the same names.
- `deprecated.light.*` / `deprecated.dark.*`: pre-v2 web names
  (`--pal-canvas`, `--pal-text`, ...) mapped to v2 tokens. Web CSS only;
  never emitted to Swift or Kotlin. Delete once no CSS uses them.
- `type.<style>.*` (15 Figma text styles: family, weight, size, line height,
  tracking in em), `space`, `radius`, `elevation.{soft,lift}`, `duration`,
  `easing`, `layout`, `icon`, `breakpoint`, `size`, `zIndex`, `font`.
- `room.*`: the 14 Room themes (ADR 017), unchanged.

## Outputs

- `generated/css/*.css`: web custom properties and Room theme rules. `:root`
  holds mode-independent values and Light; Dark overrides sit under
  `@media (prefers-color-scheme: dark)` (unless `data-appearance='light'`) and
  `[data-appearance='dark']`. `--pal-elevation-soft/lift` are composed
  `box-shadow` values. Font stacks start with `var(--font-fraunces|geist|geist-mono)`
  (set by `next/font/local`) and fall back to the plain family name.
- `src/generated/tokens.ts`: raw TypeScript map.
- `generated/swift/PaldoraTokens.swift`, `generated/kotlin/PaldoraTokens.kt`:
  typed native values. Swift also gets `PaldoraColors.<name>` as
  `PaldoraSemanticColor(light:dark:)` pairs (the app turns them into dynamic
  `Color`s); Kotlin gets `PaldoraLightColors` and `PaldoraDarkColors` objects.

## Native units

| Token type | Swift                   | Kotlin               |
| ---------- | ----------------------- | -------------------- |
| dimension  | `CGFloat` points        | `Float` dp/sp        |
| duration   | `TimeInterval` seconds  | `Int` milliseconds   |
| color      | `PaldoraColor(argb:)`   | `Long` 0xAARRGGBB    |
| number     | `Int` / `CGFloat`       | `Int` / `Float`      |
| list       | `[String]` / `[Double]` | `List<String/Float>` |

`rem` is multiplied by 16. `em` (`fontSizeRelativeLabel`) stays a unitless
ratio of the parent size. The 14 Room themes are emitted as
`PaldoraRoomThemes.presets/accents/fonts` tables (scheme derived from
luminance, as on the web), not as flat constants.

## Fonts

Fraunces, Geist and Geist Mono (SIL OFL) are bundled, not generated: web in
`apps/web/app/fonts` (loaded by `apps/web/app/fonts.ts`), iOS in
`apps/ios/Paldora/Resources/Fonts` (`UIAppFonts`, `PaldoraFont`). See
`THIRD_PARTY_NOTICES.md`.

## Contrast

`design/tokens/contrast-pairs.json` lists the used text/background pairs in
both modes (4.5 text, 3 for large text and non-text). `exceptions` pins Figma
pairs that miss AA (`text/muted`) between a floor and 4.5 so the shortfall stays
visible.

## What is and is not verified

- Verified in CI: token resolution, WCAG AA contrast pairs, Room theme
  contrast, output drift, and unit tests asserting the native files contain no
  `px`/hex strings and include all 14 Room themes.
- Spot-checked locally only: `swiftc -typecheck` on the Swift file passed.
- Not verified: the Kotlin file has never been compiled with `kotlinc`, and
  neither file is built in CI. Compile checks wait for the iOS and Android
  platform CI jobs.
