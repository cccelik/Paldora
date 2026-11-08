# Web component ownership

The active web app renders Firebase-backed data through Server Components and
small client leaves. Route files fetch data and compose components. Reusable
presentation lives here; authorization and media bytes stay in server-only
services and same-origin route handlers.

| Area                    | Active components                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Public info pages       | `LegalPage`, `LegalSection`, `LegalLinks` (`components/legal`; routes in `app/(public)`)    |
| Shell and feedback      | `AppShell`, `AppNav`, `ToastProvider`, `RealtimeBridge`                                     |
| Boxes and social        | `MemberList`, `BoxSections`, friendship and invitation controls                             |
| Posts and conversations | `FirebaseBoxFeed`, `FirebaseCommentThreads`, `FirebasePostReactions`, `PostComposer`        |
| Life Updates            | `FirebaseLifeUpdateCard`, `LifeUpdateComposer`, `LifeUpdateEditor`                          |
| Memories                | `FirebaseMemoryTimeline`, `FirebaseMemoryYearNav`, `FirebaseMemoryMonthNav`, `MemoryPeriod` |
| Rooms                   | `RoomCanvas`, widget editors, `RoomPhotoWidget`, personalization editor                     |
| Media                   | `AvatarUploader`, `RoomBannerEditor`, private same-origin media viewers                     |
| Account and operations  | export/deletion controls, report controls, moderation case controls                         |

`app/lib/server/session.ts` verifies the seven-day Auth session and loads the
current admitted account. `app/lib/server/firebase/data.ts` provides trusted
web data methods backed by `@paldora/firebase-trusted`. Server Actions validate
inputs through `runForm` and `runFormWithData`, check origin, and return typed
results to `useActionState`. Pages use `orNotFound` so missing and inaccessible
content share a 404. No component receives Firebase Admin objects or secrets.

Interactive components use CSS Modules and the generated `--pal-*` tokens.
Keep client leaves small, preserve keyboard access and 44px targets, and check
both desktop and 390px browser projects.

## Design-system primitives (Hearth & Brass)

`components/ui` holds one implementation per Figma component of page
"02 Components" (file `RAZq5RS2gSwVa4xvxbk0gZ`), named like the Figma and
SwiftUI components. All are server-compatible, styled by co-located CSS Modules
on the generated `--pal-*` tokens, and shown in Light and Dark at
`/design-preview` (local environment only, 404 elsewhere; `PALDORA_ENV=local`).

| Figma component (node)                   | React                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Button (43:98)                           | `Button`, `buttonClassName` (primary, secondary, accent, ghost, quiet, danger; L/M/S; `loading`) |
| Icon button (43:125)                     | `IconButton`, `iconButtonClassName` (surface, primary, plain; 40/52)                             |
| Chip (43:146)                            | `Chip`, `SelectableChip`; `Badge` is a thin wrapper                                              |
| Text field (43:189)                      | `TextField`, `TextAreaField` (`error`, `help`, `prefix`)                                         |
| Toggle, Radio, Checkbox (43:198/205/214) | `Toggle`, `Radio`, `Checkbox` (native inputs; `ui/selection-controls`)                           |
| Avatar (43:245)                          | `Avatar` (s/m/l/xl, `ring`), `AvatarStack`                                                       |
| Banner (43:280)                          | `Banner`; `FormMessage` renders it inside its live region                                        |
| Toast (43:296)                           | `Toast` (presentational); `ToastProvider` owns the stack                                         |
| List row (43:347)                        | `ListGroup`, `ListRow`                                                                           |
| Segmented control (43:377)               | `SegmentedControl` (native radio group)                                                          |
| Post card (44:55)                        | `PostCard`                                                                                       |
| Life Update card (44:74)                 | `LifeUpdateCard`                                                                                 |
| Box card (44:93)                         | `BoxCard`                                                                                        |
| Comment (44:122)                         | `Comment`                                                                                        |
| Notification row (44:140)                | `NotificationRow` (the `notifications/` feature row wraps it)                                    |
| Upload tile (44:166)                     | `UploadTile`                                                                                     |
| Nav bar (44:200)                         | `NavBar`                                                                                         |
| Skeleton (44:212)                        | `Skeleton`, `PostSkeleton`                                                                       |
| Overlays (44:247)                        | `Dialog`, `BottomSheet`, `OverlayCard` (`ui/overlays`, client)                                   |
| Web sidebar (26:371)                     | `Sidebar` (`shell/sidebar`; not yet wired into `AppShell`, step 3)                               |
| Icons (page 01)                          | `Icon` (`ui/icons`; the file cannot be named `icon`, a Next metadata convention)                 |

Rules: icon-only controls need a `label`; small text uses `text/secondary`
(never `text/muted`); text on a brass fill is `accent/on-brass`; loading is a
skeleton, never a spinner (except `Button loading`); one overlay at a time.
`PostCard`, `LifeUpdateCard`, `BoxCard` and `Comment` take presentation props
and slots, not Firestore view models; step 3 maps the feature data to them.
