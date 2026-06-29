#!/bin/bash
# Build, package, ad-hoc sign, and install aplyd to /Applications.
#
# The ad-hoc signing step is REQUIRED on Apple Silicon: electron-builder skips
# code signing (no Developer ID), which leaves the bundle with an invalid
# signature. macOS then silently blocks the GUI subsystem - the process launches
# but `app.whenReady()` never fires, so no window and no logs ever appear.
# Re-signing ad-hoc inside-out (frameworks -> nested helper apps -> the app) makes
# the bundle valid enough for local launch. Skipping this = a dead app.
set -e
cd "$(dirname "$0")/.."

APP=/Applications/aplyd.app
SRC=release/mac-arm64/aplyd.app

npm run build
npm run pack

pkill -9 -f "aplyd" 2>/dev/null || true
sleep 1
rm -rf "$APP"
cp -r "$SRC" "$APP"

# Ad-hoc sign inside-out - order matters (nested code before the outer bundle).
codesign --force --sign - --timestamp=none "$APP"/Contents/Frameworks/*.framework 2>/dev/null || true
codesign --force --sign - --timestamp=none "$APP"/Contents/Frameworks/*.app 2>/dev/null || true
codesign --force --sign - --timestamp=none "$APP"

xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
echo "Installed and signed: $APP"
