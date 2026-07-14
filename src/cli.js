import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { request } from "./client.js";
import { CONTROL_PORT, DAEMON_LOG_FILE, DAEMON_PID_FILE, HOME, HOST } from "./constants.js";
import { ensureDirectory, parseCommandLine, processIsAlive } from "./utils.js";
import {
  printDaemon,
  printHelp,
  printLogs,
  printMessage,
  printProject,
  printProjects,
  printTailscale,
  writeRaw
} from "./ui.js";

const daemonScript = fileURLToPath(new URL("./daemon.js", import.meta.url));

export async function run(argv) {
  if (argv[0] === "--help") return printHelp();
  if (argv[0] === "--version") return writeRaw("rn-server 0.1.0\n");
  const { positional, options } = parseCommandLine(argv);
  const [command = "help", reference, target] = positional;

  if (["help", "-h"].includes(command)) return printHelp();
  if (["version", "-v"].includes(command)) return writeRaw("rn-server 0.1.0\n");
  if (command === "daemon") return daemonCommand(reference || "status");
  await ensureDaemon();

  if (command === "add") {
    const directory = path.resolve(reference || process.cwd());
    const project = await request("/projects", {
      method: "POST",
      data: {
        directory,
        name: options.name,
        port: options.port,
        command: options.command,
        autoStart: options["no-start"] ? false : true,
        tailscale: Boolean(options.tailscale)
      }
    });
    printProject(project, `Added ${project.name}`);
    return;
  }
  if (command === "list" || command === "status") {
    const projects = await request("/projects");
    if (!projects.length) return printMessage("No projects registered", "Run rn-server add /path/to/app", "yellow");
    printProjects(projects);
    return;
  }
  if (command === "endpoint" || command === "resolve") {
    const directory = path.resolve(reference || process.cwd());
    const project = await request(`/resolve?directory=${encodeURIComponent(directory)}`);
    if (options.json) {
      writeRaw(`${JSON.stringify({
        id: project.id,
        name: project.name,
        directory: project.directory,
        endpoint: project.runtime.endpoint,
        port: project.port,
        state: project.runtime.state
      })}\n`);
    } else {
      writeRaw(`${project.runtime.endpoint}\n`);
    }
    return;
  }
  if (["start", "stop", "restart"].includes(command)) {
    if (!reference) throw new Error(`Usage: rn-server ${command} <project>`);
    const project = await request(`/projects/${encodeURIComponent(reference)}/${command}`, { method: "POST" });
    printProject(project);
    return;
  }
  if (command === "tailscale") {
    if (!["enable", "disable", "status"].includes(reference) || !target) {
      throw new Error("Usage: rn-server tailscale <enable|disable|status> <project>");
    }
    if (reference === "status") {
      const projects = await request("/projects");
      const project = projects.find((item) => item.id === target || item.name === target);
      if (!project) throw new Error(`Unknown project: ${target}`);
      printTailscale(project);
      return;
    }
    const project = await request(`/projects/${encodeURIComponent(target)}/tailscale/${reference}`, { method: "POST" });
    printTailscale(project);
    return;
  }
  if (command === "remove") {
    if (!reference) throw new Error("Usage: rn-server remove <project>");
    const project = await request(`/projects/${encodeURIComponent(reference)}`, { method: "DELETE" });
    printMessage(`Removed ${project.name}`, project.directory);
    return;
  }
  if (command === "logs") {
    if (!reference) throw new Error("Usage: rn-server logs <project>");
    const projects = await request("/projects");
    const project = projects.find((item) => item.id === reference || item.name === reference);
    if (!project) throw new Error(`Unknown project: ${reference}`);
    const lines = Number(options.lines || 80);
    const content = fs.existsSync(project.runtime.logFile) ? fs.readFileSync(project.runtime.logFile, "utf8") : "No logs yet.\n";
    printLogs(project, content.split("\n").slice(-lines).join("\n"));
    return;
  }
  throw new Error(`Unknown command: ${command}. Run rn-server help.`);
}

async function daemonCommand(action) {
  if (action === "start") {
    const started = await ensureDaemon();
    printDaemon(true, started ? `Started at http://${HOST}:${CONTROL_PORT}` : `Already running at http://${HOST}:${CONTROL_PORT}`);
    return;
  }
  if (action === "stop") {
    try {
      await request("/shutdown", { method: "POST" });
      printDaemon(false);
    } catch {
      printDaemon(false, "Daemon was not running");
    }
    return;
  }
  if (action === "status") {
    try {
      const health = await request("/health");
      printDaemon(true, `pid ${health.pid} · http://${HOST}:${CONTROL_PORT}`);
    } catch {
      printDaemon(false);
    }
    return;
  }
  throw new Error("Usage: rn-server daemon <start|stop|status>");
}

async function ensureDaemon() {
  try {
    await request("/health", { timeout: 300 });
    return false;
  } catch {}
  ensureDirectory(HOME);
  const existingPid = Number(fs.existsSync(DAEMON_PID_FILE) && fs.readFileSync(DAEMON_PID_FILE, "utf8"));
  if (processIsAlive(existingPid)) throw new Error(`Daemon pid ${existingPid} exists but its API is unavailable`);
  const output = fs.openSync(DAEMON_LOG_FILE, "a", 0o600);
  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: ["ignore", output, output],
    env: process.env
  });
  child.unref();
  fs.closeSync(output);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      await request("/health", { timeout: 300 });
      return true;
    } catch {}
  }
  throw new Error(`Daemon did not start. See ${DAEMON_LOG_FILE}`);
}
