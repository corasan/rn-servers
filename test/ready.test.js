import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { makeReady, waitForMetro } from "../src/ready.js";

test("makeReady returns one stable Metro and simulator contract", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rn-server-ready-"));
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({
    rnServer: { platform: "ios", ios: { device: "iPhone 17 Pro" } }
  }));
  const project = { id: "example", name: "Example", directory, port: 8081 };
  const result = await makeReady({
    project,
    options: {},
    start: async () => ({
      ...project,
      runtime: { endpoint: "http://127.0.0.1:8081", localEndpoint: "http://127.0.0.1:8081", pid: 123 }
    }),
    fetchStatus: async () => ({ ok: true, status: 200, text: async () => "packager-status:running" }),
    simulator: {
      ensure: async (configuration) => ({
        platform: configuration.platform,
        id: "SIM-UDID",
        name: configuration.device,
        state: "booted",
        app: null
      })
    }
  });

  assert.deepEqual(result, {
    project: { id: "example", name: "Example", directory },
    metro: {
      state: "ready",
      endpoint: "http://127.0.0.1:8081",
      localEndpoint: "http://127.0.0.1:8081",
      port: 8081,
      pid: 123
    },
    simulator: { platform: "ios", id: "SIM-UDID", name: "iPhone 17 Pro", state: "booted" },
    app: null
  });
});

test("waitForMetro retries until the packager reports ready", async () => {
  let attempts = 0;
  await waitForMetro(8081, {
    timeout: 1000,
    sleep: async () => {},
    fetchStatus: async () => {
      attempts += 1;
      return {
        ok: true,
        status: 200,
        text: async () => attempts === 2 ? "packager-status:running" : "starting"
      };
    }
  });
  assert.equal(attempts, 2);
});
