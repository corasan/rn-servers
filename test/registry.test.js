import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detectCommand, nextAvailablePort, Registry } from "../src/registry.js";
import { parseCommandLine, slugify } from "../src/utils.js";

function fixture(manifest) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rn-server-test-"));
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify(manifest));
  return directory;
}

test("slugify creates stable project ids", () => {
  assert.equal(slugify(" My Great_App! "), "my-great-app");
});

test("ports are allocated deterministically", () => {
  assert.equal(nextAvailablePort([{ port: 8081 }, { port: 8083 }]), 8082);
});

test("detects Expo and bare React Native commands", () => {
  assert.equal(detectCommand(fixture({ dependencies: { expo: "latest" } })), "npx expo start --port {port}");
  assert.equal(detectCommand(fixture({ dependencies: { "react-native": "latest" } })), "npx react-native start --port {port}");
});

test("registry persists projects and prevents duplicate paths", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "rn-server-registry-"));
  const registry = new Registry(path.join(home, "projects.json"));
  const directory = fixture({ dependencies: { expo: "latest" } });
  const project = registry.add({ directory, name: "Example", tailscale: true });
  assert.equal(project.id, "example");
  assert.equal(project.port, 8081);
  assert.equal(project.tailscale, true);
  assert.equal(registry.all()[0].directory, fs.realpathSync(directory));
  assert.throws(() => registry.add({ directory }), /already registered/);
});

test("CLI parser handles inline and positional options", () => {
  assert.deepEqual(parseCommandLine(["add", ".", "--name=Demo", "--no-start"]), {
    positional: ["add", "."],
    options: { name: "Demo", "no-start": true }
  });
});
