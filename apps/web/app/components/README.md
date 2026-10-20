# Web component catalog

Search here before writing markup. Add an entry whenever you add a shared
component.

## Layers

- `components/ui/`: stateless, server-compatible primitives. Import them from
  `components/ui`, never from individual files.
- `components/*.tsx`: product components that compose primitives or own a
  client boundary.
- `app/**/page.tsx`: data loading, redirects, and composition only.

## Primitives

| Component                    | Purpose                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| `Wordmark`                   | Brand wordmark with the four-point star. `size="inline" \| "display"`.      |
| `Button`, `buttonClassName`  | Buttons and button-styled links: `primary`, `secondary`, `quiet`, `danger`. |
| `TextField`, `TextAreaField` | Labelled controls with optional prefix, "Optional" tag, and described help. |
| `FormMessage`                | A form's live region; `success`, `attention`, `failure` tones.              |
| `Avatar`                     | Photo or initials; signed URLs render as plain `img`.                       |

## Product components

| Component                                               | Owns                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `AppShell`, `AppNav`                                    | The trusted signed-in frame: brand, primary nav, bell, avatar, sign-out. |
| `AuthLayout`                                            | Signed-out frame (sign-in, recovery, account unavailable).               |
| `OnboardingLayout`                                      | The three setup steps with progress.                                     |
| `SettingsNav`                                           | Account / Appearance / Reactions sections.                               |
| `SubmitButton`                                          | Submit with pending state (`useFormStatus`).                             |
| `ActionFeedback`                                        | Renders an `ActionResult` into `FormMessage`.                            |
| `SignInForm`, `ForgotPasswordForm`, `ResetPasswordForm` | Auth forms on `useActionState`.                                          |
| `UsernameStepForm`, `ProfileStepForm`, `AccountForm`    | Profile forms; shared username/name/bio inputs.                          |
| `AvatarUploader`, `useAvatarUpload`                     | Reserve → PUT → complete → poll; old photo stays until the new is ready. |
| `AppearanceForm`                                        | App appearance (server-stored, mirrored to the `pal-appearance` cookie). |

Shared form rhythm lives in `components/form-stack.module.css`.

## Data access

- `app/lib/session.ts` is the server-only data-access layer: `currentUser()`
  (cached per render), `completedUser()`, `userOnStep()`, `apiClient()`.
- Server Actions live in `app/actions/*` and validate every argument through
  `runForm`/`runFormWithData` (`app/lib/action-runner.ts`). Turbopack requires
  each export of a `'use server'` file to be an `async function` declaration.
- `orNotFound` turns `BOX_NOT_FOUND` into the shared not-found page.

## Page-level styles

- `app/status-page.module.css` is shared by `not-found.tsx` and `error.tsx`.
  The not-found page doubles as the "missing or not yours" state, so private
  absence and denial look identical.

## Posts, photos, and realtime

| Component              | Owns                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PostFeed`, `PostCard` | Chronological posts; hidden (blocked) items render a neutral card with no author.                                                                                                                            |
| `PhotoAttachmentList`  | The photos a composer holds: preview, upload status, Remove. Shared by the post and Life Update composers.                                                                                                   |
| `PostComposer`         | Text plus up to 4 photos; Cmd/Ctrl+Enter posts; locked while photos are processing.                                                                                                                          |
| `usePhotoAttachments`  | Photo flow: reserve → PUT → complete → wait for the worker (`lib/media-polling.ts` `untilProcessed`, shared with the camera). Takes the purpose's `prepare` and optional retained (already attached) photos. |
| `PostActions`          | The author's inline Edit and confirmed Delete.                                                                                                                                                               |
| `PostPhotos`           | Photo grid and full-screen viewer (native `<dialog>`: focus trap, Escape, arrows).                                                                                                                           |
| `LocalTime`            | UTC on the server, the viewer's timezone after mount; no hydration mismatch.                                                                                                                                 |
| `MoreLink`             | "Show more" for keyset-paged lists: a plain link, no script.                                                                                                                                                 |
| `RefreshOnPosts`       | Re-renders a page whose URL does not name the posts it shows (a Life Update's page) when a hint concerns them (`lib/realtime.ts` `concernsPosts`).                                                           |
| `RealtimeBridge`       | One event stream per tab; refreshes only the page a hint concerns; marks `data-realtime`; re-dispatches every hint as a window `paldora:realtime` event.                                                     |
| `useRealtimeHint`      | Subscribes a component to `paldora:realtime` hints (cards, the bell).                                                                                                                                        |

## Feedback

| Component                     | Owns                                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ToastProvider`, `useToast`   | The one toast stack (in the signed-in layout). Errors (`attention`, `failure`) in a `role="alert"` region, others polite; 5 s / 8 s, paused on hover and focus; at most 3; 44×44 dismiss. Timing and stacking: `lib/toast-queue.ts`. |
| `useActionToast`              | Toasts a button-style action's result once. Forms keep inline `ActionFeedback`.                                                                                                                                                      |
| `ConfirmAction` (`onSuccess`) | Optional callback for rows the page does not re-render itself (client-held replies).                                                                                                                                                 |

## Interactions and notifications

| Component                             | Owns                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PostInteractions`                    | A post's reaction bar with the `ReactionCamera` button (posts only, never comments; absent when `canInteract` is false), camera-reaction strip (up to 4 thumbnails, "+N more", link to the reactions page), and "N comments" link. Holds the summary via `useOptimisticReaction`; refetches only its own summary on a matching hint (debounced action). |
| `useOptimisticReaction`               | Server summary + `useOptimistic` + set-reaction action in a transition; failures toast. `run(kind, work)` for other senders (the camera), resolving with the outcome. Shared by posts and comments.                                                                                                                                                     |
| `ReactionBar`                         | Preset buttons (posts) or used kinds (comments, `compact`), `aria-pressed`, "React with 👍. 3 people" labels, the tap guard (`lib/tap-guard.ts`), a More/React chooser, and an `extra` slot at the end (camera button).                                                                                                                                 |
| `EmojiChooser`                        | Native `<dialog>` emoji picker: presets, curated grid, free "Any emoji" checked with `isSingleEmoji`. No nested form, so it can sit inside one.                                                                                                                                                                                                         |
| `CommentThread`                       | Server-rendered comments section: composer or archived note, pinned deep-linked thread, roots `<ol>`, older-comments `MoreLink`.                                                                                                                                                                                                                        |
| `CommentThreadView`                   | One root plus one nested reply `<ol>`; "View N more replies" (`listReplies` action); reply composer with "Replying to" chip.                                                                                                                                                                                                                            |
| `CommentEntry`, `CommentPlaceholder`  | A comment with inline edit, confirmed delete, compact reactions; neutral text for hidden and deleted rows. `id="comment-{id}"`, focusable for deep links.                                                                                                                                                                                               |
| `CommentComposer`                     | Comment or reply textarea with counter, Cmd/Ctrl+Enter.                                                                                                                                                                                                                                                                                                 |
| `ReactionPresetEditor`                | Five shortcut slots using `EmojiChooser`, reset to defaults, saved via `reactionPresetsAction`.                                                                                                                                                                                                                                                         |
| `ReactionCamera`                      | Camera button plus native `<dialog>`: live mirrored preview (CSS class), Take photo, Retake / Send, upload and processing status, Retry, and fallbacks (HTTPS, no camera, blocked with Try again) that point back to emoji. No file picker.                                                                                                             |
| `useReactionCapture`                  | The capture state machine: `getUserMedia`, canvas downscale to 1280 px JPEG 0.88 (`lib/camera.ts`), reserve → PUT → complete → poll → set reaction. Stops tracks on capture, close, unmount, and hidden page; revokes object URLs; ignores late answers after close.                                                                                    |
| `ReactionList`, `ReactionFilter`      | The `/posts/[postId]/reactions` page: people with their emoji or camera thumbnail; All / Camera filter links (no script).                                                                                                                                                                                                                               |
| `NotificationBell`                    | Header link to `/notifications`: "Notifications, N unread" (99+), refetches on notification hints, generic "new notification" toast.                                                                                                                                                                                                                    |
| `NotificationList`, `NotificationRow` | Rows are plain forms (work without JS): mark read, then redirect to the post with `?comment=` pinned. Sentences from `lib/notification-text.ts`.                                                                                                                                                                                                        |

## Life Updates

| Component                                         | Owns                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LifeUpdateCard`                                  | Server shell: author, time (permalink), edited marker, "Life Update" and "Only me" badges, sections as `<h3>` headings, `PostPhotos` once, then `LifeUpdateContexts` (or the Only Me note, with no interactions), and `LifeUpdateActions` for the author. `permalink` makes tabs follow the URL. |
| `LifeUpdateContexts`                              | Client tabs, one per Box the viewer is in (API order, alphabetical): `tablist`/`tab`/one `tabpanel`, roving tabindex, arrows wrap, Home/End (`lib/life-update-form.ts` `nextTabIndex`). The panel remounts `PostInteractions` per Box. One context renders no tab bar.                           |
| `LifeUpdateActions`                               | The author's Edit link and confirmed Delete ("removes it from every Box…"); `leaveAfterDelete` returns to `/life-updates`.                                                                                                                                                                       |
| `LifeUpdateComposer`                              | Sections, photos (`life_update_image`), audience (Boxes checkboxes with filter from 7 Boxes and "n of 20 selected", archived Boxes disabled with the reason; or Only me), the immutable-audience notice with a summary, and the reason the button is locked (`draftProblem`).                    |
| `LifeUpdateEditor`                                | Sections and photos (kept photos start ready); the page shows the audience read-only.                                                                                                                                                                                                            |
| `LifeUpdateSectionFields`, `LifeUpdatePhotoField` | The nine section fields with per-section and total counters, and the photo picker; shared by the composer and the editor.                                                                                                                                                                        |

Life Update pages: `/life-updates` (yours, Only Me included), `/life-updates/new`
(`?box=` preselects), `/life-updates/[id]` (`?box=` picks the conversation;
`?comment=` pins, via `lib/pinned-thread.ts`), `/life-updates/[id]/edit`.
`/posts/[postId]` redirects a backing post there with its Box. Server Actions
are in `actions/life-updates.ts` and `actions/life-update-photos.ts`.

## Memories

| Component                                             | Owns                                                                                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MemoryYearNav`, `MemoryMonthNav`, `MemoryTypeFilter` | Period and filter links with counts from the summary (`aria-current` marks the place). All twelve UTC months are listed; empty ones are named, not linked.                             |
| `MemoryTimeline`                                      | Items under a heading per UTC month, as `PostCard` and `LifeUpdateCard`. With `boxId` (Box Memories) cards stay in that Box: one context, no Box badge. Honest empty state.            |
| `MemoryPeriod`                                        | One year or month: the navs, the filter, the timeline, and "Load older memories" (a `MoreLink`). Shared by `/memories/[year]`, `/memories/[year]/[month]`, and `/boxes/[id]/memories`. |

Memories pages: `/memories` (years), `/memories/[year]`, `/memories/[year]/[month]`
(`?type=`, `?cursor=`), and `/boxes/[id]/memories?year=&month=&type=&cursor=`
(the newest year by default; linked from the Box page). URL parsing, links, and
UTC month grouping are pure helpers in `lib/memories.ts`; a malformed period is
`notFound()` before any API call. The pages deliberately have no `loading.tsx`:
a streamed fallback would send 200 before a not-found decision.
