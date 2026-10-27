#!/usr/bin/env bash
# Runs the iOS XCUITest against the local demo-paldora emulators.
#
#   apps/ios/scripts/ui-test.sh            (from anywhere; resolves the repo root)
#
# Emulator project demo-paldora only. No hosted Firebase, no .env.
# Env overrides: IOS_SIM_NAME (default "iPhone 16e"), IOS_SIM_OS (default "18.3.1").
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
IOS_DIR="$REPO_ROOT/apps/ios"
SIM_NAME="${IOS_SIM_NAME:-iPhone 16e}"
SIM_OS="${IOS_SIM_OS:-18.3.1}"
# Keep build products outside ~/Desktop: the simulator can hang loading
# dylibs from a Desktop path (macOS file protection).
DERIVED_DATA="${PALDORA_IOS_DERIVED_DATA:-$HOME/Library/Caches/paldora-ios/DerivedData}"

# Inner mode: runs inside `firebase emulators:exec` with all emulator hosts set.
if [[ "${1:-}" == "--inner" ]]; then
  suffix="$(openssl rand -hex 4)"
  export PALDORA_FIXTURE_EMAIL="ios-ui-${suffix}@example.invalid"
  export PALDORA_FIXTURE_PASSWORD="LocalUi-$(openssl rand -hex 8)"
  export PALDORA_FIXTURE_USERNAME="iosui${suffix}"
  export PALDORA_FIXTURE_DISPLAY_NAME="iOS UI Fixture"
  export GCLOUD_PROJECT=demo-paldora
  export FIREBASE_FUNCTIONS_EMULATOR_HOST=127.0.0.1:5001

  # Fully onboarded fixture account (username reserved, profile name set).
  FIXTURE_OUT="$(node "$REPO_ROOT/packages/firebase-trusted/scripts/seed-local.mjs")"
  FIXTURE_UID="$(echo "$FIXTURE_OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}' | head -1)"
  echo "Seeded a fully onboarded fixture account in demo-paldora."

  # A second, fully onboarded account for friend-request flows.
  PEER_USERNAME="iosuipeer${suffix}"
  PEER_OUT="$(PALDORA_FIXTURE_EMAIL="ios-ui-peer-${suffix}@example.invalid" \
    PALDORA_FIXTURE_USERNAME="$PEER_USERNAME" PALDORA_FIXTURE_DISPLAY_NAME="iOS UI Peer" \
    node "$REPO_ROOT/packages/firebase-trusted/scripts/seed-local.mjs")"
  PEER_UID="$(echo "$PEER_OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}' | head -1)"
  echo "Seeded a second fixture account (peer)."

  # A Box the peer owns, shared with the fixture, holding a peer post and comment
  # (the comment is what the UI test reports).
  PALDORA_FIXTURE_OWNER_UID="$PEER_UID" PALDORA_FIXTURE_MEMBER_UID="$FIXTURE_UID" \
    node "$REPO_ROOT/packages/firebase-trusted/scripts/seed-shared-box.mjs"

  # xcodebuild forwards TEST_RUNNER_* to the UI test runner, prefix stripped.
  export TEST_RUNNER_PALDORA_UI_EMAIL="$PALDORA_FIXTURE_EMAIL"
  export TEST_RUNNER_PALDORA_UI_PASSWORD="$PALDORA_FIXTURE_PASSWORD"
  export TEST_RUNNER_PALDORA_UI_PEER_USERNAME="$PEER_USERNAME"

  cd "$IOS_DIR"
  xcodegen generate
  xcodebuild test \
    -project Paldora.xcodeproj -scheme Paldora \
    -only-testing:PaldoraUITests \
    -destination "platform=iOS Simulator,name=${SIM_NAME},OS=${SIM_OS}" \
    -derivedDataPath "$DERIVED_DATA" \
    -resultBundlePath "$DERIVED_DATA/ui-test-$(date +%s).xcresult" \
    -skipPackagePluginValidation CODE_SIGN_IDENTITY=-
  exit 0
fi

UDID="$(xcrun simctl list devices available -j | python3 -c '
import json, sys
name, os_ver = sys.argv[1], sys.argv[2]
for runtime, devices in json.load(sys.stdin)["devices"].items():
    if runtime.endswith("iOS-" + os_ver.replace(".", "-")):
        for d in devices:
            if d["name"] == name:
                print(d["udid"]); raise SystemExit
' "$SIM_NAME" "$SIM_OS" || true)"

cleanup() {
  if [[ -n "$UDID" ]]; then xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

cd "$REPO_ROOT"
# Same build step as `pnpm firebase:local:flow:test`.
pnpm turbo run build --filter=@paldora/firebase-functions
pnpm exec firebase emulators:exec \
  --only auth,firestore,storage,functions,pubsub \
  --project demo-paldora --config firebase.native.json \
  "bash '$IOS_DIR/scripts/ui-test.sh' --inner"
