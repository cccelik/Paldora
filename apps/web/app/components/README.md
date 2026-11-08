# Web component ownership

The active web app renders Firebase-backed data through Server Components and
small client leaves. Route files fetch data and compose components. Reusable
presentation lives here; authorization and media bytes stay in server-only
services and same-origin route handlers.

| Area                    | Active components                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Public info pages       | `LegalPage`, `LegalSection`, `LegalLinks` (`components/legal`; routes in `app/(public)`)                            |
| Shell and feedback      | `AppShell`, `ShellNavigation` (`Sidebar` from 1024px, floating bottom nav below), `ToastProvider`, `RealtimeBridge` |
| Boxes and social        | `MemberList`, `BoxSections`, friendship and invitation controls                                                     |
| Posts and conversations | `FirebaseBoxFeed`, `FirebaseCommentThreads`, `FirebasePostReactions`, `PostComposer`                                |
| Life Updates            | `FirebaseLifeUpdateCard`, `LifeUpdateComposer`, `LifeUpdateEditor`                                                  |
| Memories                | `FirebaseMemoryTimeline`, `FirebaseMemoryYearNav`, `FirebaseMemoryMonthNav`, `MemoryPeriod`                         |
| Rooms                   | `RoomCanvas`, widget editors, `RoomPhotoWidget`, personalization editor                                             |
| Media                   | `AvatarUploader`, `RoomBannerEditor`, private same-origin media viewers                                             |
| Account and operations  | export/deletion controls, report controls, moderation case controls                                                 |

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

| Figma component (node)                   | React                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Button (43:98)                           | `Button`, `buttonClassName` (primary, secondary, accent, ghost, quiet, danger; L/M/S; `loading`)                           |
| Icon button (43:125)                     | `IconButton`, `iconButtonClassName` (surface, primary, plain; 40/52)                                                       |
| Chip (43:146)                            | `Chip`, `SelectableChip`; `Badge` is a thin wrapper                                                                        |
| Text field (43:189)                      | `TextField`, `TextAreaField` (`error`, `help`, `prefix`)                                                                   |
| Toggle, Radio, Checkbox (43:198/205/214) | `Toggle`, `Radio`, `Checkbox` (native inputs; `ui/selection-controls`)                                                     |
| Avatar (43:245)                          | `Avatar` (s/m/l/xl, `ring`), `AvatarStack`                                                                                 |
| Banner (43:280)                          | `Banner`; `FormMessage` renders it inside its live region                                                                  |
| Toast (43:296)                           | `Toast` (presentational); `ToastProvider` owns the stack                                                                   |
| List row (43:347)                        | `ListGroup`, `ListRow`                                                                                                     |
| Segmented control (43:377)               | `SegmentedControl` (native radio group)                                                                                    |
| Post card (44:55)                        | `PostCard`                                                                                                                 |
| Life Update card (44:74)                 | `LifeUpdateCard`                                                                                                           |
| Box card (44:93)                         | `BoxCard`                                                                                                                  |
| Comment (44:122)                         | `Comment`                                                                                                                  |
| Notification row (44:140)                | `NotificationRow` (the `notifications/` feature row wraps it)                                                              |
| Upload tile (44:166)                     | `UploadTile`                                                                                                               |
| Nav bar (44:200)                         | `NavBar`                                                                                                                   |
| Skeleton (44:212)                        | `Skeleton`, `PostSkeleton`                                                                                                 |
| Overlays (44:247)                        | `Dialog`, `BottomSheet`, `OverlayCard` (`ui/overlays`, client)                                                             |
| Post overflow (44:55)                    | `OverflowMenu` (`ui/overflow-menu`, client); `PostMenu`, `LifeUpdateMenu` own the items and `Dialog`s                      |
| Web sidebar (26:371)                     | `Sidebar` (`shell/sidebar`, rendered by `shell/shell-navigation` inside `AppShell`)                                        |
| Icons (page 01)                          | `Icon` (`ui/icons`; Lucide symbols, see "Icon mapping" below; the file cannot be named `icon`, a Next metadata convention) |

Rules: icon-only controls need a `label`; small text uses `text/secondary`
(never `text/muted`); text on a brass fill is `accent/on-brass`; loading is a
skeleton, never a spinner (except `Button loading`); one overlay at a time. Owner and viewer actions on a post or Life Update
live in an `OverflowMenu` whose items open a `Dialog`, never inline buttons.
The `text/muted` AA exception is accepted permanently: placeholders only.
`PostCard`, `LifeUpdateCard`, `BoxCard` and `Comment` take presentation props
and slots, not Firestore view models; step 3 maps the feature data to them.

## Step 3 screens (web)

Feature data is mapped onto the primitives by the feature components, not by
the primitives: `FirebaseBoxFeed` (`PostCard`, `LifeUpdateCard`),
`FirebaseLifeUpdateCard` (detail), `FirebaseCommentThreads` (`Comment`),
`PostDetail` (Figma W04), `BoxHero` and `BoxRail`, `BoxCardList` (`BoxCard`),
the notifications row (`NotificationRow`), `SettingsNav`. Page-level helpers in
`ui`: `PageHeader` (eyebrow, italic accent, action slot), `PageColumns` (feed
plus 388px rail from 1280px), `PageLoading` (route `loading.tsx` skeletons) and
`StatusPanel` (in-shell inaccessible and error states, used by
`(signed-in)/not-found.tsx` and `(signed-in)/error.tsx`). `PostCard` takes
`ariaLabel` and `controls`; `LifeUpdateCard` takes `ariaLabel`, `children` and a
light `footer` panel (interactive controls need a light surface on the inverse
card).

## Photo resizing before upload

Every photo purpose (post, Life Update, avatar, Room banner) goes through
`lib/media/prepare-image.ts` (`prepareMediaFile`) before the prepare, PUT and
complete flow. A photo within the purpose's `maxLongEdge`, `maxInputPixels` and
`maxBytes` (all in `MEDIA_PURPOSE_POLICIES`) is uploaded untouched. Otherwise it
is decoded with EXIF orientation applied, downscaled keeping its aspect ratio
and re-encoded (WebP, or JPEG when WebP can't be written; PNG only when it has
transparency and fits). The result is what is uploaded, with its own content type
and length. Undecodable files within the byte limit are passed on, so the server
(which keeps its pixel cap and all other checks) gives the precise reason.
Camera frames are already downscaled in `lib/media/camera.ts`.

Privacy: a resized photo is re-encoded in the browser, so the original's EXIF
and GPS data never leave the device. An untouched photo still carries them until
the worker strips them. iOS needs the same downscale before upload (not yet
implemented): same per-purpose long edges from the policy table.
