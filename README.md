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

Agents should never guess a Metro port. From the project working directory they
can use:

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

## macOS and iOS app direction

The process supervisor deliberately lives outside the GUI. A React Native
macOS menu-bar app can consume the local API to add project folders, show
health/logs/endpoints, and start or stop apps without opening Terminal. It can
also install the daemon as a macOS LaunchAgent so all opted-in projects start at
login.

An iOS companion can be a remote dashboard, but it cannot directly supervise
processes on the Mac. Remote control should be a later, authenticated API mode;
the current API binds only to `127.0.0.1` and is intentionally local.

## Development

Requires Node.js 20 or newer and has no runtime dependencies.

```sh
npm test
npm link
rn-server help
```
