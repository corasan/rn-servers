# RN Server for macOS

The macOS companion is a native SwiftUI app targeting macOS 14 or newer. It
uses the loopback API at `http://127.0.0.1:7231` and launches the same Node
daemon used by the terminal CLI.

## Development workflow

Open the checked-in Xcode project, select the shared `RNServerApp` scheme, and
press Command-R:

```sh
npm ci
open apps/macos/RNServer.xcodeproj
```

Debug builds locate `bin/rn-server.js` in this repository automatically and
start its daemon. No scheme environment variables, CocoaPods, or second Metro
server are required. Run the native unit tests with Command-U.

The Swift Package remains available for command-line development and release
packaging:

```sh
# From the repository root
swift run --package-path apps/macos RNServerApp
swift test --package-path apps/macos
```

For development outside the repository root, point the app at the CLI:

```sh
RN_SERVER_CLI_SCRIPT=/absolute/path/to/rn-server/bin/rn-server.js \
  swift run --package-path apps/macos RNServerApp
```

## Distribution

```sh
npm run macos:build
npm run macos:verify
```

The builder:

1. Downloads the official Node 24 LTS archive for the current architecture.
2. Verifies it against Node's published SHA-256 checksums.
3. Builds the Swift app in release mode.
4. Embeds Node, npm/npx, the CLI, and production dependencies.
5. Creates `RN Server.app` and an installer package under `dist/`.
6. Adds `/usr/local/bin/rn-server` to the installer payload.

The package is architecture-specific. Build once on Apple Silicon for `arm64`
and once on an Intel build host with `RN_SERVER_ARCH=x86_64` for `x86_64`.

### Signing

Unsigned builds are suitable for local development. Release builds require
Developer ID Application and Developer ID Installer identities:

```sh
RN_SERVER_CODESIGN_IDENTITY="Developer ID Application: Example (TEAMID)" \
RN_SERVER_INSTALLER_IDENTITY="Developer ID Installer: Example (TEAMID)" \
  npm run macos:build
```

After signing, submit the `.pkg` with `xcrun notarytool` and staple the accepted
ticket before distribution. Signing and notarization cannot be completed
without Apple Developer credentials.

## Bundle layout

```text
RN Server.app/Contents/
├── MacOS/RN Server
└── Resources/cli/
    ├── node
    ├── npm / npx
    ├── bin/rn-server.js
    ├── src/
    └── node_modules/
```

The installed launcher resolves the CLI from the application bundle, ensuring
the GUI and terminal always use the same version.
