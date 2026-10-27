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
  - `Views/`: sign-in, tab shell (Home, Boxes, Notifications are honest
    placeholders for the next slice; Profile is real: edit display name and
    bio, appearance, reaction presets, sign out).
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
(random credentials per run), passes them to the UI test through
`PALDORA_UI_EMAIL` and `PALDORA_UI_PASSWORD` (`TEST_RUNNER_` prefix), runs the
test on the iPhone 16e simulator, and shuts the simulator down. Override with
`IOS_SIM_NAME` and `IOS_SIM_OS`.

The fixture suite loads every file in `contracts/native/fixtures` and
round-trips each valid request and response through the Swift types. A fixture
whose callable has no Swift contract fails the suite unless it is listed, with
a reason, in `notYetCovered` in `FixtureConformanceTests.swift`. All 46
callables are typed today.
