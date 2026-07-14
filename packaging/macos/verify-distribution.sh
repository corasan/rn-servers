#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARCH="${RN_SERVER_ARCH:-$(uname -m)}"
DIST="$ROOT/dist/macos-$ARCH"
APP="$DIST/RN Server.app"
PKG="$(find "$DIST" -maxdepth 1 -name 'RN-Server-*.pkg' -print -quit)"

test -x "$APP/Contents/MacOS/RN Server"
test -x "$APP/Contents/Resources/cli/node"
test -x "$APP/Contents/Resources/cli/npx"
test -f "$APP/Contents/Resources/cli/bin/rn-server.js"
test -x "$DIST/pkg-root/usr/local/bin/rn-server"
test -n "$PKG"

"$APP/Contents/Resources/cli/node" "$APP/Contents/Resources/cli/bin/rn-server.js" --version
RN_SERVER_APP_BUNDLE="$APP" "$DIST/pkg-root/usr/local/bin/rn-server" --version
HELP_OUTPUT="$("$APP/Contents/Resources/cli/node" "$APP/Contents/Resources/cli/bin/rn-server.js" help)"
grep -q 'rn-server ready' <<< "$HELP_OUTPUT"
codesign --verify --deep --strict "$APP"
if ! pkgutil --check-signature "$PKG"; then
  echo "Installer package is unsigned (development build)."
fi
PAYLOAD_FILES="$(pkgutil --payload-files "$PKG")"
grep -q 'usr/local/bin/rn-server' <<< "$PAYLOAD_FILES"
grep -q 'Applications/RN Server.app' <<< "$PAYLOAD_FILES"

echo "Distribution verified: $PKG"
