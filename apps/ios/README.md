# Paldora iOS

Native Swift/SwiftUI client. It lives in this repository but **outside** the
pnpm and Turborepo graph (no `package.json`, not listed in
`pnpm-workspace.yaml`). Xcode and SwiftPM build it. No React Native or Expo.

## Layout

- `Packages/PaldoraKit`: Firebase-SDK-free core with no third-party
  dependencies (iOS 17 / macOS 14, Swift 6 language mode).
  - `Contract/`: hand-written `Codable` and `Sendable` DTOs, one file per
    domain, plus `Contracts.swift` (one `CallableContract` per callable and
    `Contracts.all`).
  - `Callables.swift`: `CallableName`, `CallableTransport` (JSON `Data` in and
    out; the app target implements it with Firebase Functions) and
    `PaldoraAPI` with one typed async method per callable.
  - `Errors/`: `PaldoraError` (the 17 Functions codes), `ErrorReason`,
    `PaldoraFailure`, and `TransportError`, which the app transport throws.
    Server messages are never carried or shown.
  - `Tokens/PaldoraTokens.swift`: a committed relative symlink to the generated
    `packages/tokens/generated/swift/PaldoraTokens.swift`. Do not edit it;
    regenerate with `pnpm tokens:generate`.
- `Paldora/`: the SwiftUI app target (iOS 17+, iPhone and iPad, bundle id
  `com.paldora.app`), generated into `Paldora.xcodeproj` by XcodeGen.
  - `Config/`: `AppConfiguration` (pure fail-closed resolution) and
    `FirebaseBootstrap` (programmatic `FirebaseOptions`, no
    `GoogleService-Info.plist`).
  - `Services/`: `AuthService` (protocol plus the Firebase Auth
    implementation; Firebase owns Keychain persistence and refresh) and
    `FirebaseCallableTransport` (`CallableTransport` over Functions in
    `europe-west4`; maps `FunctionsErrorCode` and `details.reason` to
    `TransportError`; never logs bodies, tokens or emails).
  - `Model/`: `AppModel` (`@Observable`; states loading, signedOut,
    signedIn, accountNotReady, profileUnavailable, notConfigured).
  - `Design/`: `Theme` and `Typography` over `PaldoraTokens`, shared components.
  - `Views/`: sign-in, status screens, tab shell, and the Profile tab (edit
    display name and bio, appearance, reaction presets, sign out).
  - `Features/`: one folder per feature, `@Observable` view models that take a
    `FeatureEnvironment` (typed API, current user, failure handling) and are
    unit-tested through a fake transport.
    - `Shared/`: `PagedList` (opaque-cursor pagination, refresh, inline
      errors, neutral "unavailable"), box and member name directories, state
      views.
    - `Home/`: `getHomeFeed` cards for posts and Life Updates; unknown feed
      kinds render a neutral card. Media shows only as a "photo" label until
      the Storage design lands (ids are opaque).
    - `Boxes/`: list and create, invitations (accept/decline), Box detail
      with members, text composer (5,000 characters).
    - `Posts/`: post detail, edit/delete own post, report, comments (one reply
      level; create/edit/delete), emoji reactions (presets from your profile
      plus any single emoji; optimistic with rollback).
    - `Notifications/`: paged list, tap marks read and opens the post,
      mark-all-read, tab badge. The badge polls on foreground and every 30 s
      (ADR 021 decision 2: polling first).
  - `Media/`: the authenticated media layer (ADR 021 decision 8).
    - `MediaClient` (`URLSessionMediaClient`): `mediaUpload` PUT with the exact
      `Content-Type` and length from `createMediaUpload`, `mediaRead` GET, both
      with `Authorization: Bearer <Firebase ID token>` (one forced token refresh
      on 401). Ephemeral session, no URL cache, no cookies.
    - `ImageLoader`: in-memory only (`NSCache`), in-flight de-duplication,
      cancel when the last waiter goes away, 404 becomes a neutral "Photo
      unavailable" placeholder (briefly remembered), cleared on sign-out. No
      disk cache and no URLs are kept.
    - `ImagePreparer`: on-device downscale (long edge 2560) and JPEG re-encode
      from raw pixels, so EXIF and GPS never leave the device; stays under the
      10 MB policy.
    - `PhotoUpload` / `PhotoAttachments`: prepare, reserve, upload (with
      progress), complete, then poll `getMediaAsset` (bounded) with an honest
      "Processing" state; failures keep their stage so Retry resumes there.
      Up to four photos per post; the post is created with `mediaAssetIds`.
    - Views: `PhotosPicker` attachments, `PhotoStrip` thumbnails, a full-screen
      `PhotoViewer` (display variant, pinch to zoom). Save and share are
      omitted on purpose: web shares the post permalink, never bytes.
    - Avatars: `AvatarView` (initials fallback) from the opaque
      `avatarMediaId` fields (profile, feed authors, members, notification
      actors). Profile photo upload is on the Profile tab.
    - UI-test hook: with `PALDORA_UI_TEST_IMAGE=1` a DEBUG-only "Attach test
      photo" button adds a generated image. It is compiled out of Release.
  - `Friends/`: send a request by username (every failure is one neutral
    line, rate limits keep their own), incoming and sent requests,
    accept/decline/withdraw/remove (`closeFriendship`), block from a friend
    row, and the blocked list with unblock (`listMyBlocks`, your own blocks
    only). Reached from Profile. Copy follows the web Friends page.
  - `LifeUpdates/`: composer (nine sections, 2,000 each and 10,000 total, up to
    4 photos, Only me or 1 to 20 active Boxes chosen once, one idempotency key
    per form), my Life Updates, detail (sections, photos, delivery contexts
    ordered alphabetically, link to the conversation in the selected Box; Only
    Me has no interactions), edit (sections and photos, never the audience) and
    delete. Feed Life Update cards open the detail on their own delivery.
  - Comment reactions: a "React" sheet per comment (`setBoxReaction` with
    `commentId`), presets plus any single emoji, optimistic with rollback.
  - `Rooms/`: **My Room is its own tab** (CLAUDE.md section I) and any Room opens
    by username from member rows, post authors and friends (`getRoom`; a
    missing, hidden or blocked Room is one neutral "No longer available").
    The Room renders from registry ids through the generated
    `PaldoraRoomThemes` tokens (14 themes, 8 accents, 5 system font stacks,
    decoration packs, sparkles), a banner (opaque `bannerMediaId` through the
    image loader), a music link card (https only, opened with `Link`, never
    embedded or autoplayed), widgets (visibility, order, main or sidebar),
    Top Friends, a photo grid with the full-screen viewer, and Life Update and
    post snippets. `single` and `two_column` layouts adapt: two columns only on
    a regular-width screen (iPad), otherwise one column in stored order.
    Memories, Customize and the visibility note sit in an app-styled bar
    **outside** the Room theme. The owner editor covers theme, layout, accent,
    font, decoration, sparkles, location, currently, music, visibility, banner
    upload, widgets (switch, placement, explicit Move up and Move down buttons,
    not drag only) and Top Friends (4, 8 or 12, chosen from accepted friends,
    ordered). Every save carries `expectedUpdatedAt`; `STALE_WRITE` stops the
    save and shows "changed somewhere else", where Reload discards the edits
    and loads the latest. Phase 8 personalization stays web-only.
  - `Memories/`: derived timelines for me (Profile), a Box (Box detail) and a
    Room (Room bar). Year and month chips come from the summaries, the type
    filter is All, Posts or Life Updates, pages use opaque cursors, and each
    item opens the underlying post or Life Update (never a copy). Summary
    failures (60 an hour) do not block the list.
  - `Settings/` (Profile, Settings): **Security** (change password with current
    plus new of 10 to 1,024 characters and a confirmation, secure fields,
    passwords cleared after the call and redacted in every description; success
    and "sign out everywhere" both sign out locally and show a neutral "Sign in
    again" notice). **Your data** (request an archive, status pending, ready,
    expired or failed with web copy, bounded polling while pending, download
    through `accountExportDownload` with the Bearer ID token into a
    complete-file-protection temp file, system share sheet, file deleted when
    the sheet closes, 404 is one neutral "isn't available anymore"). **Delete
    account** (seven-day grace period and "transfer every owned Box first"
    explained, blocked state, password plus a destructive confirmation to
    request or cancel; like the web, neither signs you out). **Your reports**
    (receipts) and **Content notices** with honest empty states.
  - Reports: a comment row has Report (category Harassment, Spam, Privacy or
    Something else, plus optional detail up to 2,000) using `reportBoxComment`;
    posts are reported from the post menu with `reportBoxPost`. A revoked
    session (for example after a password change elsewhere) signs out
    neutrally from any call.
  - **Box management** (Box detail, gear icon, role-aware exactly as the web via
    `BoxRules`, which mirrors `packages/domain`): owners rename and archive or
    restore; owners and admins invite by username and see and revoke pending
    invitations (only while the Box is active); the Members screen offers Make
    admin or Make member, Make owner (confirmed, you become an admin) and
    Remove per the role matrix; non-owners can leave; an owner is told to
    transfer first. Delete needs the exact Box name plus your own
    acknowledgement and a confirmation, then polls `boxDeletionStatus` until
    complete. Failures are one neutral line. Friends: Withdraw uses
    `cancelFriendRequest` (distinct from Decline).
  - **Threaded comments:** post detail uses `listBoxCommentThreads` (roots
    newest first, a reply preview, "View N more replies" through
    `listBoxCommentReplies`), keeps deleted and hidden placeholders, and a
    notification opens the post with the linked comment's thread pinned
    (`getBoxCommentThread`). Per-comment reaction counts are in the React sheet
    (`listBoxReactions` with `commentId`) rather than loaded for every row.
  - **Onboarding:** an unfinished account is walked through username
    (`reserveUsername`, shown back normalized, neutral taken or unavailable
    errors), profile (display name and bio) and an optional avatar, each saved
    before the next so the app resumes at the right step. `accountNotReady`
    remains only for unprovisioned or unavailable accounts.
  - **Avatar and banner:** Profile has Remove photo (`deleteAvatar`); the Room
    editor uploads and removes the banner (`room_banner`) through the media layer.
  - **Forgot password** on the sign-in screen uses the Firebase Auth client
    (`sendPasswordReset`). The confirmation is identical whether or not the
    email has an account; only an empty address or an unreachable service
    differ. The Auth emulator accepts it and sends nothing.
  - **Camera reactions:** the React section offers "React with a photo" when the
    device has a front camera. An AVFoundation sheet (front camera, permission
    prompt, a clear denied state with a Settings link, no photo-library
    picker) captures one JPEG, uploads it as `reaction_image`, then sends
    `setBoxReaction` with `kind: real` and the `mediaAssetId`. It needs
    `NSCameraUsageDescription` (set in `project.yml`). Camera thumbnails seen in
    the feed show under the reactions. The simulator has no camera, so with
    `PALDORA_UI_TEST_IMAGE=1` a DEBUG-only provider returns a generated image
    (compiled out of Release).
  - Not in the app yet: reports of Boxes or people, Phase 8 Room personalization (web-only), staff screens. Reports: web can report posts and comments
    (`createReport`), native has only `reportBoxPost`, so only posts are
    reportable on iOS; there is no web report for Boxes or people. Deleted comments are simply absent because the
    contract returns no placeholder for them.
- `PaldoraTests/`: unit tests (Swift Testing) with a fake `AuthService` and
  fake `CallableTransport`. `PaldoraUITests/`: one XCUITest.
- `Config/Hosted.xcconfig`: the hosted Firebase placeholders (empty).
- `scripts/ui-test.sh`: emulator-backed UI test runner.

## Firebase configuration

- DEBUG builds use only the emulator project `demo-paldora` (Auth
  `127.0.0.1:9099`, Functions `127.0.0.1:5001`, region `europe-west4`).
- RELEASE builds never use emulators or `demo-*` project ids. They read the
  hosted values from `Config/Hosted.xcconfig` through Info.plist. They are
  unset (no hosted project exists, ADR 021 decision 9), so a release build
  shows "Paldora isn't configured" and contacts nothing. Set them only when
  the owner provisions a hosted project.
- Forgot-password is omitted: no contract-safe path exists yet.

## Firebase SDK pin

`firebase-ios-sdk` **13.0.1** (exact, `project.yml`), published 2026-10-07 and
20 days old on 2026-10-27. Newer releases at the time (13.1.0 on 2026-10-21,
13.1.1 and 12.19.3 on 2026-10-22) were under the 14-day minimum. Only the
`FirebaseAuth` and `FirebaseFunctions` products are linked. Raise the pin
only to a release at least 14 days old.

## Generate, build, run

```bash
cd apps/ios
xcodegen generate            # writes Paldora.xcodeproj (gitignored)
open Paldora.xcodeproj       # or build from the CLI below
```

Start the local backend first (`pnpm firebase:local:dev` from the repo root),
and seed an account (`pnpm firebase:local:seed`; set
`PALDORA_FIXTURE_USERNAME` and `PALDORA_FIXTURE_DISPLAY_NAME` to onboard it).

**Build outside `~/Desktop`.** The simulator can hang loading dylibs from a
Desktop path. Use a derived data path elsewhere:

```bash
xcodebuild build -project Paldora.xcodeproj -scheme Paldora \
  -destination 'platform=iOS Simulator,name=iPhone 16e,OS=18.3.1' \
  -derivedDataPath ~/Library/Caches/paldora-ios/DerivedData \
  -skipPackagePluginValidation CODE_SIGN_IDENTITY=-
```

Simulator builds need ad-hoc signing (`CODE_SIGN_IDENTITY=-`, not
`CODE_SIGNING_ALLOWED=NO`) or Firebase Auth cannot use the Keychain.

## Contract rules

Source of truth: `packages/validation/src/native` and
`contracts/native/callables.schema.json` (ADR 021). Timestamps are epoch
milliseconds (`EpochMillis`, with a `.date` helper), cursors are opaque
strings, unknown JSON keys are ignored, and errors are the Functions code plus
an optional `details.reason`.

## Tests

```bash
cd apps/ios/Packages/PaldoraKit && swift test          # contract core
cd apps/ios && xcodebuild test -project Paldora.xcodeproj -scheme Paldora \
  -only-testing:PaldoraTests -derivedDataPath ~/Library/Caches/paldora-ios/DerivedData \
  -destination 'platform=iOS Simulator,name=iPhone 16e,OS=18.3.1' \
  -skipPackagePluginValidation CODE_SIGN_IDENTITY=-     # app unit tests
apps/ios/scripts/ui-test.sh                              # XCUITest on emulators
```

`ui-test.sh` (run from anywhere) builds the Functions, starts the
`demo-paldora` emulators with `firebase emulators:exec`, seeds a fully
onboarded fixture account with `packages/firebase-trusted/scripts/seed-local.mjs`
(random credentials per run), passes them to the UI tests through
`PALDORA_UI_EMAIL` and `PALDORA_UI_PASSWORD` (`TEST_RUNNER_` prefix), runs them
on the iPhone 16e simulator, and shuts the simulator down. The UI tests cover
sign-in, profile edit and sign-out, a friend request to a second seeded
account, an Only Me Life Update (create, edit, delete), My Room (change theme, save,
reopen to see it), Memories, a password change and sign-in with the new
password (then restored), a data export reaching ready and opening the share
sheet, onboarding of a fresh unfinished account (a third seeded user), Box
rename, invite, revoke and the owner-cannot-leave explanation, forgot password,
a camera reaction through the DEBUG test camera, reporting a peer's comment (the script seeds a Box the peer owns with a
post and comment) and its receipt, and creating a Box, posting, opening the
post with a generated photo, opening it from Home and the photo viewer,
reacting and commenting. Override with
`IOS_SIM_NAME` and `IOS_SIM_OS`.

The fixture suite loads every file in `contracts/native/fixtures` and
round-trips each valid request and response through the Swift types. A fixture
whose callable has no Swift contract fails the suite unless it is listed, with
a reason, in `notYetCovered` in `FixtureConformanceTests.swift`. All 47
callables are typed today.

## CI

`.github/workflows/ios.yml` runs on changes under `apps/ios`, `contracts/native`
or `packages/tokens`: `swift test` for PaldoraKit, then an unsigned simulator
build. It is **not yet verified on a GitHub macOS runner** (Xcode and simulator
versions there may differ from the local Xcode 27.1). The unit and UI tests need
the Firebase emulators and a booted simulator, so they run locally through
`scripts/ui-test.sh` and are not part of this job yet.
