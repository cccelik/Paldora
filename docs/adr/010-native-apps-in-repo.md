# ADR 010: Native apps live in this repository, outside the pnpm graph

Status: accepted (2026-10-18). Implements R11. The apps are built in
Phases 10–11.

## Decision

- **Two separate native apps:**
  - `apps/ios` is an Xcode project with Swift Package Manager, written in
    SwiftUI.
  - `apps/android` is a Gradle project (Kotlin DSL), written in Jetpack
    Compose.
- **No shared UI.** React Native and Expo are not used. The legacy Expo
  scaffold is not carried forward.
- **Not in the pnpm workspace.** Neither directory has a `package.json`, so
  pnpm and Turborepo ignore them.
- **Separate CI.** Each platform gets its own path-filtered job (macOS runner
  for iOS; Ubuntu with an emulator for Android). A job triggers on changes to
  its app, `contracts/`, or `design/tokens/`.
- **Shared inputs.** The apps consume `contracts/openapi.json`, the
  conformance fixtures, and the generated token constants in
  `packages/tokens/generated/{swift,kotlin}`.
- **What they share** with web: API semantics, terminology, fixtures, and
  token values. **Never UI code.** Each app follows its platform's
  navigation, accessibility, secure storage, lifecycle, and push conventions.

## Why the same repository

A small team, and contract or token changes must land atomically with the API
change that motivates them.

## Revisit when

Separate teams own the platforms, or CI minutes or cost become a measured
problem.
