# Paldora Design System v0.1

Paldora is the expressive old internet rebuilt as a calm, private, premium scrapbook. The trusted application shell is restrained; user Rooms carry the expressive range. Gold is a signal, not a fill color.

## Brand signature

- Promise: **A box for your people.**
- Product posture: private by default, chronological, no targeted ads, memories belong to the user.
- Primary mark: editorial `Paldora` wordmark with one four-point star emerging from an open-box aperture.
- Small mark: a geometric `P` whose counter forms an open box; one star sits above the opening.
- Motifs: four-point star, fine constellation line, photo corner, translucent tape, date stamp, paper edge.
- Motif limit: at most one decorative cluster per viewport outside user Rooms.

## Color tokens

| Token                      |     Value | Use                                   |
| -------------------------- | --------: | ------------------------------------- |
| `color.brand.obsidian`     | `#11100E` | Dark canvas, trusted shell            |
| `color.brand.softBlack`    | `#191713` | Raised dark surfaces                  |
| `color.brand.gold`         | `#C79A3B` | Active state, keyline, premium signal |
| `color.brand.deepGold`     | `#9C7424` | Gold text on light surfaces           |
| `color.brand.champagne`    | `#F4E7C3` | Warm highlight and soft badge         |
| `color.brand.ivory`        | `#FAF7EF` | Light canvas                          |
| `color.brand.paper`        | `#F4EFE5` | Light raised surface                  |
| `color.brand.lavender`     | `#C8B7E8` | Emotional accent, not system status   |
| `color.text.dark.primary`  | `#F8F1E0` | Primary text on dark                  |
| `color.text.dark.muted`    | `#B9AF9D` | Secondary text on dark                |
| `color.text.light.primary` | `#171717` | Primary text on light                 |
| `color.text.light.muted`   | `#6E6250` | Secondary text on light               |
| `color.status.success`     | `#668060` | Success, online, complete             |
| `color.status.warning`     | `#A96F2D` | Caution and quota                     |
| `color.status.danger`      | `#A54B46` | Destructive and security risk         |
| `color.focus`              | `#8D6CD1` | 3px accessible focus ring             |

Gold-on-ivory uses Deep Gold for readable text. Antique Gold is reserved for large text, icons, borders, and non-text ornament unless contrast is independently verified.

## Typography

- `font.brand`: Cormorant Garamond or a licensed/self-hosted equivalent; wordmark and campaign headlines only.
- `font.editorial`: Newsreader or a similar high-legibility serif; Room titles, Life Update headings, memory dates.
- `font.ui`: Geist/Inter or a system-equivalent sans; all controls and functional copy.
- `font.annotation`: a restrained handwritten face; decorative annotations only and always duplicated by semantic UI when meaningful.

| Style        | Size / line | Weight | Use                   |
| ------------ | ----------- | -----: | --------------------- |
| `display.xl` | 72/68       |    600 | Landing hero          |
| `display.lg` | 52/52       |    600 | Room and memory title |
| `heading.1`  | 36/42       |    600 | Page title            |
| `heading.2`  | 26/32       |    600 | Section title         |
| `heading.3`  | 20/26       |    600 | Card title            |
| `body.lg`    | 18/28       |    400 | Editorial intro       |
| `body.md`    | 16/24       |    400 | Primary reading       |
| `body.sm`    | 14/20       |    400 | Secondary UI          |
| `label`      | 13/16       |    600 | Controls and metadata |
| `caption`    | 12/16       |    500 | Dates and audience    |

Text supports 200% browser zoom and dynamic type. UI text never uses the annotation face.

## Spacing, grids, and breakpoints

- Base unit: 4px.
- Scale: `space.1=4`, `2=8`, `3=12`, `4=16`, `5=20`, `6=24`, `8=32`, `10=40`, `12=48`, `16=64`, `20=80`.
- Desktop: 12 columns, 24px gutters, max content width 1280px.
- Tablet: 8 columns, 20px gutters, 24px edges.
- Mobile: 4 columns, 16px gutters, 16px edges.
- Breakpoints: `sm=390`, `md=768`, `lg=1024`, `xl=1280`, `2xl=1440`.
- Feed reading column: 620px maximum. Secondary rail: 288px. Desktop navigation rail: 232px expanded / 80px compact.

## Shape, elevation, and materials

| Token         | Value                             |
| ------------- | --------------------------------- |
| `radius.sm`   | 8px                               |
| `radius.md`   | 14px                              |
| `radius.lg`   | 20px                              |
| `radius.xl`   | 28px                              |
| `radius.pill` | 999px                             |
| `shadow.1`    | `0 1px 2px rgb(17 16 14 / 8%)`    |
| `shadow.2`    | `0 10px 30px rgb(17 16 14 / 10%)` |
| `shadow.3`    | `0 24px 70px rgb(17 16 14 / 18%)` |

Application surfaces remain crisp and mostly flat. Paper texture is below 4% opacity. Glassmorphism is prohibited. Custom Rooms may use stronger material styling inside the trusted Room frame.

## Motion

- `motion.fast`: 120ms, hover and press.
- `motion.standard`: 200ms, menus and tabs.
- `motion.slow`: 320ms, sheets and editor previews.
- Easing: `cubic-bezier(.2,.8,.2,1)`.
- No essential information depends on animation.
- Reduced-motion replaces transforms with opacity or immediate state changes.
- Decorative sparkles never loop indefinitely in the trusted shell.

## Z-index

| Token        | Value |
| ------------ | ----: |
| `z.base`     |     0 |
| `z.sticky`   |   100 |
| `z.dropdown` |   300 |
| `z.overlay`  |   500 |
| `z.modal`    |   600 |
| `z.toast`    |   700 |
| `z.security` |   800 |

Custom Room content is capped below `z.sticky`; it cannot cover trusted navigation, privacy, moderation, account, or payment surfaces.

## Iconography

- 1.75px rounded strokes at 20px and 24px.
- Filled variant only for selected navigation or reaction state.
- Every icon-only action has an accessible name and 44×44px minimum target.
- Privacy icons use lock, people, star-circle, Box, and eye-off symbols; icons always pair with text in composers.

## Component inventory

| Component                 | Variants / states                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Button                    | primary obsidian, primary gold, secondary, quiet, destructive; default/hover/focus/pressed/loading/disabled |
| IconButton                | neutral, selected, destructive; tooltip on desktop                                                          |
| TextField                 | text, email, password, search; help/error/success/disabled                                                  |
| Select                    | standard, audience selector, searchable                                                                     |
| Checkbox / Radio / Switch | default/focus/selected/disabled                                                                             |
| Avatar                    | 24, 32, 40, 48, 64, 96; image/initial/placeholder/story-ring                                                |
| UserCard                  | compact row, discovery card, invitation card, Top Friend tile                                               |
| PrivacyBadge              | public, friends, close friends, Box, only me; icon + text                                                   |
| BoxBadge                  | owner, admin, member, private, invite pending                                                               |
| PostCard                  | text, photo, gallery, quote, link, Life Update, music, poll, milestone                                      |
| ReactionBar               | heart count, comments, save, share-within-Paldora                                                           |
| Comment                   | root/reply/edited/moderated/deleted; maximum visual depth 2                                                 |
| Composer                  | modal, page, mobile sheet; draft/upload/error/publishing                                                    |
| MediaUploader             | empty, dragging, validating, processing, failed, complete                                                   |
| BoxCard                   | standard, featured memory, invitation, empty                                                                |
| LifeUpdateCard            | compact feed, expanded, monthly summary                                                                     |
| MemoryCard                | photo, text, milestone, On This Day, recap                                                                  |
| PhotoGrid                 | 1-up, 2-up, 3-up, masonry, album cover                                                                      |
| ThemeCard                 | preset, selected, premium, custom draft                                                                     |
| NotificationRow           | unread/read; friend/comment/reaction/invite/update/memory                                                   |
| Modal                     | small confirmation, standard form, large composer                                                           |
| BottomSheet               | action menu, audience picker, composer, confirmation                                                        |
| Toast                     | success, info, warning, failure; dismissible and announced                                                  |
| Tabs                      | underline, contained, mobile scrollable                                                                     |
| Navigation                | desktop rail, mobile bottom bar, Room trusted header                                                        |
| Skeleton                  | feed, Room, gallery, comments, notifications, search                                                        |
| EmptyState                | illustration + title + explanatory copy + optional action                                                   |
| ErrorState                | inline, card, page, offline; recovery action                                                                |
| PremiumBadge              | subtle gold keyline; never applied to privacy controls                                                      |

## Accessibility contract

- WCAG 2.2 AA contrast for functional content.
- 44×44px minimum touch target; 24px minimum separation for adjacent destructive actions.
- Persistent visible focus with `color.focus`; focus order follows reading order.
- Audience/privacy changes are announced and shown before publication.
- Color never carries state alone.
- Modals trap focus, restore focus on close, and close via Escape when safe.
- Bottom navigation labels remain visible.
- Images require alt text or explicit decorative treatment.
- Room themes cannot reduce shell contrast, hide trusted controls, or override reduced-motion preferences.

## Responsive behavior

- At 1024px the navigation rail compacts and the right context rail becomes a drawer.
- At 768px the shell changes to a native-feeling bottom navigation and single reading column.
- Modals become bottom sheets or full-screen flows on mobile.
- Editors use progressive disclosure: desktop three-pane becomes preview plus tabbed controls on mobile.
- Desktop and mobile preserve task hierarchy, not pixel placement.
