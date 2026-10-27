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
- The app target comes later and will depend on `PaldoraKit`.

## Contract rules

Source of truth: `packages/validation/src/native` and
`contracts/native/callables.schema.json` (ADR 021). Timestamps are epoch
milliseconds (`EpochMillis`, with a `.date` helper), cursors are opaque
strings, unknown JSON keys are ignored, and errors are the Functions code plus
an optional `details.reason`.

## Tests

```bash
cd apps/ios/Packages/PaldoraKit && swift test
```

The fixture suite loads every file in `contracts/native/fixtures` and
round-trips each valid request and response through the Swift types. A fixture
whose callable has no Swift contract fails the suite unless it is listed, with
a reason, in `notYetCovered` in `FixtureConformanceTests.swift`. All 46
callables are typed today.
