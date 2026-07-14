#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="${RN_SERVER_VERSION:-0.1.0}"
NODE_VERSION="${RN_SERVER_NODE_VERSION:-24.18.0}"
ARCH="${RN_SERVER_ARCH:-$(uname -m)}"
DIST="$ROOT/dist/macos-$ARCH"
CACHE="$ROOT/dist/cache"
APP="$DIST/RN Server.app"
PAYLOAD="$DIST/pkg-root"
CLI_RESOURCES="$APP/Contents/Resources/cli"

case "$ARCH" in
  arm64) NODE_ARCH="arm64" ;;
  x86_64) NODE_ARCH="x64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

NODE_BASENAME="node-v$NODE_VERSION-darwin-$NODE_ARCH"
NODE_ARCHIVE="$CACHE/$NODE_BASENAME.tar.xz"
NODE_URL="https://nodejs.org/download/release/v$NODE_VERSION/$NODE_BASENAME.tar.xz"
SHASUMS_URL="https://nodejs.org/download/release/v$NODE_VERSION/SHASUMS256.txt"

mkdir -p "$CACHE"
if [ ! -f "$NODE_ARCHIVE" ]; then
  curl --fail --location --progress-bar "$NODE_URL" --output "$NODE_ARCHIVE"
fi
curl --fail --silent --show-error "$SHASUMS_URL" --output "$CACHE/SHASUMS256-$NODE_VERSION.txt"
EXPECTED="$(awk -v file="$NODE_BASENAME.tar.xz" '$2 == file { print $1 }' "$CACHE/SHASUMS256-$NODE_VERSION.txt")"
ACTUAL="$(shasum -a 256 "$NODE_ARCHIVE" | awk '{ print $1 }')"
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "Node archive checksum verification failed" >&2
  exit 1
fi

rm -rf "$DIST/staging" "$APP" "$PAYLOAD"
mkdir -p "$APP/Contents/MacOS" "$CLI_RESOURCES" "$DIST/staging/node" "$PAYLOAD/Applications" "$PAYLOAD/usr/local/bin"

CLANG_MODULE_CACHE_PATH=/private/tmp/rn-server-clang-cache \
SWIFTPM_MODULECACHE_OVERRIDE=/private/tmp/rn-server-swift-cache \
swift build --package-path "$ROOT/apps/macos" --configuration release

cp "$ROOT/apps/macos/.build/$ARCH-apple-macosx/release/RNServerApp" "$APP/Contents/MacOS/RN Server"
cp "$SCRIPT_DIR/Info.plist" "$APP/Contents/Info.plist"

tar -xJf "$NODE_ARCHIVE" -C "$DIST/staging/node"
cp "$DIST/staging/node/$NODE_BASENAME/bin/node" "$CLI_RESOURCES/node"
mkdir -p "$CLI_RESOURCES/lib/node_modules"
cp -R "$DIST/staging/node/$NODE_BASENAME/lib/node_modules/npm" "$CLI_RESOURCES/lib/node_modules/"
ln -s "lib/node_modules/npm/bin/npm-cli.js" "$CLI_RESOURCES/npm"
ln -s "lib/node_modules/npm/bin/npx-cli.js" "$CLI_RESOURCES/npx"
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$ROOT/README.md" "$CLI_RESOURCES/"
cp -R "$ROOT/bin" "$ROOT/src" "$CLI_RESOURCES/"
npm ci --omit=dev --ignore-scripts --prefix "$CLI_RESOURCES"

chmod 755 "$APP/Contents/MacOS/RN Server" "$CLI_RESOURCES/node" "$CLI_RESOURCES/npm" "$CLI_RESOURCES/npx"
plutil -replace CFBundleShortVersionString -string "$VERSION" "$APP/Contents/Info.plist"

if [ -n "${RN_SERVER_CODESIGN_IDENTITY:-}" ]; then
  codesign --force --options runtime --timestamp --sign "$RN_SERVER_CODESIGN_IDENTITY" "$CLI_RESOURCES/node"
  codesign --force --deep --options runtime --timestamp --sign "$RN_SERVER_CODESIGN_IDENTITY" "$APP"
else
  codesign --force --deep --sign - "$APP"
fi

ditto "$APP" "$PAYLOAD/Applications/RN Server.app"
cp "$SCRIPT_DIR/rn-server-launcher" "$PAYLOAD/usr/local/bin/rn-server"
chmod 755 "$PAYLOAD/usr/local/bin/rn-server"
xattr -cr "$PAYLOAD"

PKG="$DIST/RN-Server-$VERSION-$ARCH.pkg"
if [ -n "${RN_SERVER_INSTALLER_IDENTITY:-}" ]; then
  COPYFILE_DISABLE=1 pkgbuild --root "$PAYLOAD" --identifier com.henry.rnserver --version "$VERSION" --install-location / --sign "$RN_SERVER_INSTALLER_IDENTITY" "$PKG"
else
  COPYFILE_DISABLE=1 pkgbuild --root "$PAYLOAD" --identifier com.henry.rnserver --version "$VERSION" --install-location / "$PKG"
fi

echo "$APP"
echo "$PKG"
