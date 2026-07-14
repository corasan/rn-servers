import fs from "node:fs";
import path from "node:path";
import { SimulatorManager, readyConfiguration } from "./simulators.js";

export async function makeReady({ project, options = {}, start, simulator = new SimulatorManager(), fetchStatus = fetch }) {
  const started = await start(project);
  const timeout = parseTimeout(options.timeout);
  await waitForMetro(started.port, { timeout, fetchStatus });

  const manifest = JSON.parse(fs.readFileSync(path.join(started.directory, "package.json"), "utf8"));
  const configuration = readyConfiguration(manifest, options);
  const device = await simulator.ensure({
    ...configuration,
    port: started.port,
    timeout
  });
  const { app, ...simulatorResult } = device;

  return {
    project: {
      id: started.id,
      name: started.name,
      directory: started.directory
    },
    metro: {
      state: "ready",
      endpoint: started.runtime.endpoint,
      localEndpoint: started.runtime.localEndpoint,
      port: started.port,
      pid: started.runtime.pid
    },
    simulator: simulatorResult,
    app
  };
}

export async function waitForMetro(port, { timeout = 30_000, fetchStatus = fetch, sleep = delay } = {}) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetchStatus(`http://127.0.0.1:${port}/status`, {
        signal: AbortSignal.timeout(1000)
      });
      const status = await response.text();
      if (response.ok && status.includes("packager-status:running")) return;
      lastError = new Error(`Metro returned ${response.status}: ${status.trim()}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Metro on port ${port} was not ready within ${timeout / 1000} seconds${lastError ? `: ${lastError.message}` : ""}`);
}

function parseTimeout(value) {
  if (value === undefined) return 180_000;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600) {
    throw new Error("Timeout must be a number of seconds between 1 and 600");
  }
  return seconds * 1000;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
