# Third-party notices

## Fonts (SIL Open Font License 1.1)

Fonts are bundled and self-hosted; nothing is fetched at runtime. The full
license texts sit next to the files.

| Family     | Copyright holder                                   | Files                                                                                                                                           | Source (pinned)                                                                                          |
| ---------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Fraunces   | 2018 The Fraunces Project Authors (Undercase Type) | `apps/web/app/fonts/Fraunces-*-Variable.woff2`, `apps/ios/Paldora/Resources/Fonts/Fraunces-{Light,LightItalic,Regular}.ttf`, `OFL-Fraunces.txt` | google/fonts `ofl/fraunces` at commit `4024282d9b0c` (2026-02-27), variable TTF instanced with fontTools |
| Geist      | 2023 Vercel, in collaboration with basement.studio | `apps/web/app/fonts/Geist-Variable.woff2`, `apps/ios/Paldora/Resources/Fonts/Geist-{Regular,Medium,SemiBold}.ttf`, `OFL-Geist.txt`              | npm `geist@1.8.2` (2026-10-21)                                                                           |
| Geist Mono | 2023 Vercel, in collaboration with basement.studio | `apps/web/app/fonts/GeistMono-Variable.woff2`, `apps/ios/Paldora/Resources/Fonts/GeistMono-Regular.ttf`                                         | npm `geist@1.8.2`                                                                                        |

Modifications to Fraunces (permitted by the OFL, no Reserved Font Name is
declared): the variable axes SOFT and WONK are pinned to 0 and 1 (as in the
Figma kit), weight is limited to 300 to 500 on web, and the iOS files are static
instances (Light and Light Italic at optical size 72, Regular at 24) with
renamed PostScript names. Geist files are unmodified.
