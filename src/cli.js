import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { request } from "./client.js";
import { CONTROL_PORT, DAEMON_LOG_FILE, DAEMON_PID_FILE, HOME, HOST } from "./constants.js";
import { ensureDirectory, parseCommandLine, processIsAlive } from "./utils.js";

const daemonScript = fileURLToPath(new URL("./daemon.js", import.meta.url));

export async function run(argv) {
  const { positional, options } = parseCommandLine(argv);
  const [command = "help", reference, target] = positional;

  if (["help", "--help", "-h"].includes(command)) return printHelp();
  if (["version", "--version", "-v"].includes(command)) return console.log("rn-server 0.1.0");
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
    console.log(`Added ${project.name}`);
    printProject(project);
    return;
  }
  if (command === "list" || command === "status") {
    const projects = await request("/projects");
    if (!projects.length) return console.log("No projects registered. Run: rn-server add /path/to/app");
    printTable(projects);
    return;
  }
  if (command === "endpoint" || command === "resolve") {
    const directory = path.resolve(reference || process.cwd());
    const project = await request(`/resolve?directory=${encodeURIComponent(directory)}`);
    if (options.json) {
      console.log(JSON.stringify({
        id: project.id,
        name: project.name,
        directory: project.directory,
        endpoint: project.runtime.endpoint,
        port: project.port,
        state: project.runtime.state
      }));
    } else {
      console.log(project.runtime.endpoint);
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
    console.log(`Removed ${project.name}`);
    return;
  }
  if (command === "logs") {
    if (!reference) throw new Error("Usage: rn-server logs <project>");
    const projects = await request("/projects");
    const project = projects.find((item) => item.id === reference || item.name === reference);
    if (!project) throw new Error(`Unknown project: ${reference}`);
    const lines = Number(options.lines || 80);
    const content = fs.existsSync(project.runtime.logFile) ? fs.readFileSync(project.runtime.logFile, "utf8") : "No logs yet.\n";
    console.log(content.split("\n").slice(-lines).join("\n"));
    return;
  }
  throw new Error(`Unknown command: ${command}. Run rn-server help.`);
}

async function daemonCommand(action) {
  if (action === "start") {
    const started = await ensureDaemon();
    console.log(started ? `Daemon started at http://${HOST}:${CONTROL_PORT}` : "Daemon is already running");
    return;
  }
  if (action === "stop") {
    try {
      await request("/shutdown", { method: "POST" });
      console.log("Daemon stopped");
    } catch {
      console.log("Daemon is not running");
    }
    return;
  }
  if (action === "status") {
    try {
      const health = await request("/health");
      console.log(`Daemon is running (pid ${health.pid}) at http://${HOST}:${CONTROL_PORT}`);
    } catch {
      console.log("Daemon is not running");
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

function printProject(project) {
  console.log(`${project.name}: ${project.runtime.state} · ${project.runtime.endpoint}`);
  console.log(`  ${project.directory}`);
}

function printTailscale(project) {
  const tailscale = project.runtime.tailscale;
  console.log(`${project.name}: Tailscale ${tailscale.state}`);
  if (tailscale.endpoint) console.log(`  ${tailscale.endpoint}`);
  if (tailscale.error) console.log(`  ${tailscale.error}`);
}

function printTable(projects) {
  const rows = projects.map((project) => ({
    NAME: project.name,
    STATE: project.runtime.state,
    ENDPOINT: project.runtime.endpoint,
    DIRECTORY: project.directory
  }));
  console.table(rows);
}

function printHelp() {
  console.log(`rn-server — persistent React Native development servers

Usage:
  rn-server add [directory] [--name NAME] [--port PORT] [--command COMMAND] [--no-start] [--tailscale]
  rn-server list
  rn-server endpoint [directory] [--json]
  rn-server start|stop|restart <project>
  rn-server logs <project> [--lines 80]
  rn-server remove <project>
  rn-server tailscale enable|disable|status <project>
  rn-server daemon start|stop|status

Commands may use a project name or its generated id. Custom commands can contain
{port}; for example: --command "npm run dev -- --port {port}".`);
}
