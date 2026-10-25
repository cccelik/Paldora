# Web component ownership

The active web app renders Firebase-backed data through Server Components and
small client leaves. Route files fetch data and compose components. Reusable
presentation lives here; authorization and media bytes stay in server-only
services and same-origin route handlers.

| Area                    | Active components                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------- |
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
