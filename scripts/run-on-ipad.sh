#!/usr/bin/env bash
# Builds Rolling Ball, installs it on a USB-connected iPad and launches it with its
# console attached (frame-rate and quality logs show up here).
#
# One-time setup:
#   1. Xcode → Settings → Accounts: sign in with your Apple ID (a free account works).
#   2. Connect the iPad by USB, unlock it and tap "Trust This Computer".
#   3. On the iPad: Settings → Privacy & Security → Developer Mode → On (it restarts).
#
# Usage:
#   TEAM_ID=ABCDE12345 npm run ios:device              # first connected iPad
#   TEAM_ID=ABCDE12345 npm run ios:device -- <UDID>    # a specific device
# Optional: BUNDLE_ID=<your.app.id>. The default adds your team ID to com.rollingball.game,
# because that plain identifier is already registered by someone else at Apple.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${TEAM_ID:?Set TEAM_ID to your Apple developer team ID (Xcode → Settings → Accounts → select the team)}"
BUNDLE_ID="${BUNDLE_ID:-com.rollingball.game.t$(printf %s "$TEAM_ID" | tr "[:upper:]" "[:lower:]")}"
DEVICE="${1:-}"

if [ -z "$DEVICE" ]; then
  json="$(mktemp)"
  xcrun devicectl list devices --json-output "$json" >/dev/null
  DEVICE="$(python3 - "$json" <<'PY'
import json, sys
devices = json.load(open(sys.argv[1]))["result"]["devices"]
for d in devices:
    hw = d.get("hardwareProperties", {})
    if hw.get("deviceType") == "iPad" and hw.get("reality") == "physical":
        print(hw["udid"])
        break
PY
)"
  rm -f "$json"
fi
[ -n "$DEVICE" ] || { echo "No physical iPad found. Connect it by USB and unlock it." >&2; exit 1; }
echo "Device: $DEVICE"

npm run ios

DERIVED=ios/App/build
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "id=$DEVICE" -derivedDataPath "$DERIVED" \
  DEVELOPMENT_TEAM="$TEAM_ID" PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  build | grep -E "error|warning: .*sign|BUILD" || true

APP="$DERIVED/Build/Products/Debug-iphoneos/App.app"
[ -d "$APP" ] || { echo "Build failed; see the errors above." >&2; exit 1; }

xcrun devicectl device install app --device "$DEVICE" "$APP"
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing --console "$BUNDLE_ID"
