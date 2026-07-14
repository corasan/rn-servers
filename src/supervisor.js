import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { LOGS_DIR } from "./constants.js";
import { TailscaleServe } from "./tailscale.js";
import { ensureDirectory, processIsAlive } from "./utils.js";

export class Supervisor {
  constructor({ logsDirectory = LOGS_DIR, tailscale = new TailscaleServe() } = {}) {
    this.logsDirectory = logsDirectory;
    this.processes = new Map();
    this.history = new Map();
    this.tailscale = tailscale;
    ensureDirectory(logsDirectory);
  }

  status(project) {
    const child = this.processes.get(project.id);
    const running = Boolean(child && processIsAlive(child.pid));
    const previous = this.history.get(project.id);
    const tailnet = this.tailscale.status(project);
    const localEndpoint = `http://127.0.0.1:${project.port}`;
    return {
      state: running ? "running" : previous?.state || "stopped",
      pid: running ? child.pid : null,
      endpoint: tailnet.endpoint || localEndpoint,
      localEndpoint,
      tailscale: tailnet,
      logFile: this.logFile(project),
      exitCode: previous?.exitCode ?? null,
      startedAt: previous?.startedAt || null
    };
  }

  start(project) {
    if (this.status(project).state === "running") return this.status(project);
    const command = project.command.replaceAll("{port}", String(project.port));
    const logFile = this.logFile(project);
    const output = fs.openSync(logFile, "a", 0o600);
    fs.writeSync(output, `\n[${new Date().toISOString()}] starting: ${command}\n`);
    const child = spawn(command, {
      cwd: project.directory,
      shell: true,
      detached: true,
      env: { ...process.env, PORT: String(project.port), RN_SERVER_PORT: String(project.port) },
      stdio: ["ignore", output, output]
    });
    fs.closeSync(output);
    this.processes.set(project.id, child);
    this.history.set(project.id, {
      state: "running",
      startedAt: new Date().toISOString(),
      exitCode: null
    });
    child.on("exit", (exitCode) => {
      this.processes.delete(project.id);
      if (project.tailscale) this.tailscale.disable(project);
      this.history.set(project.id, {
        ...this.history.get(project.id),
        state: exitCode === 0 || exitCode === null ? "stopped" : "failed",
        exitCode
      });
    });
    child.unref();
    if (project.tailscale) this.tailscale.enable(project);
    return this.status(project);
  }

  async stop(project) {
    const child = this.processes.get(project.id);
    if (project.tailscale) this.tailscale.disable(project);
    if (!child || !processIsAlive(child.pid)) return this.status(project);
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    await waitForExit(child, 4000);
    if (processIsAlive(child.pid)) {
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
    }
    this.processes.delete(project.id);
    this.history.set(project.id, { ...this.history.get(project.id), state: "stopped" });
    return this.status(project);
  }

  enableTailscale(project) {
    return this.tailscale.enable(project);
  }

  disableTailscale(project) {
    return this.tailscale.disable(project);
  }

  async stopAll(projects) {
    await Promise.all(projects.map((project) => this.stop(project)));
  }

  logFile(project) {
    return path.join(this.logsDirectory, `${project.id}.log`);
  }
}

function waitForExit(child, timeout) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, timeout);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
