# rn-server

`rn-server` keeps every React Native/Expo development server running in the
background at a stable endpoint. It gives humans and coding agents one registry
instead of a collection of terminals and mystery Metro ports.

## The workflow

```sh
# One-time setup for each app
rn-server add ~/Projects/my-app
rn-server add ~/Projects/other-app --name other
rn-server add ~/Projects/mobile-app --tailscale

# See every app, process state, and endpoint
rn-server list

# From anywhere inside a registered project (agent-friendly)
rn-server endpoint
rn-server endpoint --json
rn-server ready --platform ios --json

# Process control
rn-server stop my-app
rn-server restart my-app
rn-server logs my-app
rn-server tailscale enable my-app
```

The first project receives port `8081`, the next `8082`, and so on. Assignments
are persisted in `~/.rn-server/projects.json`, so they do not change between
restarts. The CLI automatically starts the local daemon when needed, and all
registered projects default to auto-starting with it.

## Tailscale Serve

Add `--tailscale` when registering a project, or enable it later:

```sh
rn-server tailscale enable my-app
cd ~/Projects/my-app && rn-server endpoint
```

The daemon configures a private Tailscale Serve TCP forwarder for Metro. Metro
continues listening on `127.0.0.1`, while devices allowed by your tailnet ACLs
can use an endpoint such as `http://dev-mac.example.ts.net:8081`. TCP forwarding
preserves Metro's HTTP and WebSocket traffic without requiring the app to trust
a separate HTTPS certificate. Stopping or removing a project removes its Serve
listener; restarting it restores the listener.

This requires the `tailscale` CLI, an active Tailscale connection, and MagicDNS.
Use `rn-server tailscale status my-app` to inspect setup errors, and disable the
route with `rn-server tailscale disable my-app`.

Expo and bare React Native projects are detected from `package.json`. A custom
server command can be registered with a `{port}` placeholder:

```sh
rn-server add . --command "npm run start -- --port {port}"
```

## Agent contract

Agents should never guess a Metro port or simulator identifier. From the
project working directory, one idempotent command prepares both:

```sh
rn-server ready --json
```

It starts the registered Metro server, waits for the packager to respond,
selects or boots the configured iOS Simulator or Android emulator, applies
Android `adb reverse` using the project's assigned port, optionally launches an
installed app, and prints one machine-readable result:

```json
{"project":{"id":"my-app","name":"my-app","directory":"/Users/me/Projects/my-app"},"metro":{"state":"ready","endpoint":"http://127.0.0.1:8081","localEndpoint":"http://127.0.0.1:8081","port":8081,"pid":1234},"simulator":{"platform":"ios","id":"AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE","name":"iPhone 17 Pro","state":"booted"},"app":{"id":"com.example.myapp","state":"launched"}}
```

Check deterministic defaults into the app's `package.json` so every human and
agent uses the same target:

```json
{
  "rnServer": {
    "platform": "ios",
    "ios": {
      "device": "iPhone 17 Pro",
      "appId": "com.example.myapp"
    },
    "android": {
      "device": "Pixel_9_Pro",
      "appId": "com.example.myapp"
    }
  }
}
```

Command-line values override project defaults:

```sh
rn-server ready --platform android --device Pixel_9_Pro --app-id com.example.myapp --json
rn-server ready --platform ios --device AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE --no-open --json
```

To resolve only the stable Metro endpoint without starting a simulator, use:

```sh
rn-server endpoint --json
```

which returns a stable machine-readable object:

```json
{"id":"my-app","name":"my-app","directory":"/Users/me/Projects/my-app","endpoint":"http://127.0.0.1:8081","port":8081,"state":"running"}
```

The background daemon also exposes a loopback-only API at
`http://127.0.0.1:7231`:

- `GET /health`
- `GET /projects`
- `GET /resolve?directory=/absolute/project/path`
- `POST /projects`
- `POST /projects/:id/start`, `/stop`, or `/restart`
- `DELETE /projects/:id`

## macOS app

The native SwiftUI companion provides a dashboard and menu-bar controls for
adding projects, opening or copying endpoints, controlling Metro processes,
and toggling Tailscale Serve. It embeds the Node runtime and this CLI, so the
destination Mac does not need Node installed.

The distributable `.pkg` installs both components together:

- `/Applications/RN Server.app`
- `/usr/local/bin/rn-server`

Build and verify an architecture-specific development package with:

```sh
npm run macos:build
npm run macos:verify
```

See [`apps/macos/README.md`](apps/macos/README.md) for development, signing,
notarization, and packaging details.

The process supervisor deliberately remains outside the GUI, so Metro servers
continue running when the app window or menu-bar app closes.

## iOS app direction

An iOS companion can be a remote dashboard, but it cannot directly supervise
processes on the Mac. Remote control should be a later, authenticated API mode;
the current API binds only to `127.0.0.1` and is intentionally local.

## Development

Requires Node.js 20 or newer. The terminal interface is rendered with
[Ink](https://github.com/vadimdemedes/ink), while endpoint and JSON commands
remain plain text for reliable use in scripts.

```sh
npm test
npm run macos:test
npm link
rn-server help
```
