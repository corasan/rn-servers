import assert from "node:assert/strict";
import test from "node:test";
import { resolveTailscaleBinary, TailscaleServe } from "../src/tailscale.js";

const project = { id: "example", port: 8081, tailscale: true };

test("Tailscale Serve exposes Metro through a stable tailnet TCP endpoint", () => {
  const calls = [];
  const tailscale = new TailscaleServe({
    run(args) {
      calls.push(args);
      if (args[0] === "status") return JSON.stringify({ Self: { DNSName: "dev-mac.example.ts.net." } });
      return "";
    }
  });

  assert.deepEqual(tailscale.enable(project), {
    state: "enabled",
    endpoint: "http://dev-mac.example.ts.net:8081",
    dnsName: "dev-mac.example.ts.net",
    error: null
  });
  assert.deepEqual(calls, [
    ["status", "--json"],
    ["serve", "--bg", "--tcp=8081", "tcp://127.0.0.1:8081"]
  ]);
});

test("Tailscale Serve removes a project's TCP listener", () => {
  const calls = [];
  const tailscale = new TailscaleServe({ run(args) { calls.push(args); return ""; } });
  assert.equal(tailscale.disable(project).state, "disabled");
  assert.deepEqual(calls, [["serve", "--tcp=8081", "off"]]);
});

test("Tailscale failures are reported without crashing Metro supervision", () => {
  const tailscale = new TailscaleServe({ run() { throw new Error("not connected"); } });
  assert.deepEqual(tailscale.enable(project), {
    state: "failed",
    endpoint: null,
    dnsName: null,
    error: "not connected"
  });
});

test("Tailscale binary discovery works with a macOS GUI app PATH", () => {
  const available = new Set(["/Applications/Tailscale.app/Contents/MacOS/Tailscale"]);
  assert.equal(resolveTailscaleBinary({ exists: (candidate) => available.has(candidate) }),
    "/Applications/Tailscale.app/Contents/MacOS/Tailscale");
  assert.equal(resolveTailscaleBinary({ configured: "/custom/tailscale", exists: () => true }),
    "/custom/tailscale");
});
