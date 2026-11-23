#!/usr/bin/env bash
# Copies the rendered artwork from resources/ into the iOS project and the web build.
#
# 1. npm run dev, then open http://localhost:5173/tools/art.html
#    (renders resources/icon-1024.png and resources/splash-2732.png with the game's 3D assets)
# 2. npm run art:install
set -euo pipefail
cd "$(dirname "$0")/.."

ICON=resources/icon-1024.png
SPLASH=resources/splash-2732.png
[ -f "$ICON" ] && [ -f "$SPLASH" ] || { echo "Render the artwork first: open /tools/art.html with npm run dev." >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# App Store icons and launch images must be opaque: flatten away the alpha channel.
flatten() {
  sips -s format jpeg -s formatOptions 100 "$1" --out "$tmp/flat.jpg" >/dev/null
  sips -s format png "$tmp/flat.jpg" --out "$2" >/dev/null
}

ASSETS=ios/App/App/Assets.xcassets
flatten "$ICON" "$ASSETS/AppIcon.appiconset/AppIcon-512@2x.png"
for f in splash-2732x2732.png splash-2732x2732-1.png splash-2732x2732-2.png; do
  flatten "$SPLASH" "$ASSETS/Splash.imageset/$f"
done

mkdir -p public
sips -Z 180 "$ICON" --out public/apple-touch-icon.png >/dev/null
sips -Z 64 "$ICON" --out public/favicon.png >/dev/null
echo "Installed app icon, launch screen and web icons."
