# @paldora/tokens

Design tokens generated from `design/tokens/paldora.tokens.json` (W3C DTCG)
by `pnpm tokens:generate`. `pnpm tokens:check` byte-compares the committed
outputs and fails on drift. See ADR 005.

## Outputs

- `generated/css/*.css`: web custom properties and Room theme rules.
- `src/generated/tokens.ts`: raw TypeScript map.
- `generated/swift/PaldoraTokens.swift`, `generated/kotlin/PaldoraTokens.kt`:
  typed native values.

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

## What is and is not verified

- Verified in CI: token resolution, WCAG AA contrast pairs, Room theme
  contrast, output drift, and unit tests asserting the native files contain no
  `px`/hex strings and include all 14 Room themes.
- Spot-checked locally only: `swiftc -typecheck` on the Swift file passed.
- Not verified: the Kotlin file has never been compiled with `kotlinc`, and
  neither file is built in CI. Compile checks wait for the iOS and Android
  platform CI jobs.
