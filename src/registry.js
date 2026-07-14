import fs from "node:fs";
import path from "node:path";
import { FIRST_METRO_PORT, REGISTRY_FILE } from "./constants.js";
import { readJson, slugify, writeJsonAtomic } from "./utils.js";

export class Registry {
  constructor(file = REGISTRY_FILE) {
    this.file = file;
  }

  all() {
    const data = readJson(this.file, { version: 1, projects: [] });
    return data.projects || [];
  }

  save(projects) {
    writeJsonAtomic(this.file, { version: 1, projects });
  }

  find(reference) {
    return this.all().find((project) => project.id === reference || project.name === reference);
  }

  add({ directory, name, port, command, autoStart = true, tailscale = false }) {
    const projects = this.all();
    const resolvedDirectory = fs.realpathSync(directory);
    const stats = fs.statSync(resolvedDirectory);
    if (!stats.isDirectory()) throw new Error(`${resolvedDirectory} is not a directory`);
    if (!fs.existsSync(path.join(resolvedDirectory, "package.json"))) {
      throw new Error(`${resolvedDirectory} does not contain a package.json`);
    }
    if (projects.some((project) => project.directory === resolvedDirectory)) {
      throw new Error("That directory is already registered");
    }

    const baseName = name || path.basename(resolvedDirectory);
    let id = slugify(baseName);
    let suffix = 2;
    while (projects.some((project) => project.id === id)) id = `${slugify(baseName)}-${suffix++}`;
    if (name && projects.some((project) => project.name === name)) {
      throw new Error(`A project named ${name} already exists`);
    }

    const selectedPort = port ? Number(port) : nextAvailablePort(projects);
    if (!Number.isInteger(selectedPort) || selectedPort < 1024 || selectedPort > 65535) {
      throw new Error("Port must be an integer between 1024 and 65535");
    }
    if (projects.some((project) => project.port === selectedPort)) {
      throw new Error(`Port ${selectedPort} is already assigned`);
    }

    const project = {
      id,
      name: name || baseName,
      directory: resolvedDirectory,
      port: selectedPort,
      command: command || detectCommand(resolvedDirectory),
      autoStart: Boolean(autoStart),
      tailscale: Boolean(tailscale),
      createdAt: new Date().toISOString()
    };
    projects.push(project);
    this.save(projects);
    return project;
  }

  update(reference, changes) {
    const projects = this.all();
    const index = projects.findIndex((project) => project.id === reference || project.name === reference);
    if (index === -1) throw new Error(`Unknown project: ${reference}`);
    projects[index] = { ...projects[index], ...changes };
    this.save(projects);
    return projects[index];
  }

  remove(reference) {
    const projects = this.all();
    const project = projects.find((item) => item.id === reference || item.name === reference);
    if (!project) throw new Error(`Unknown project: ${reference}`);
    this.save(projects.filter((item) => item.id !== project.id));
    return project;
  }
}

export function nextAvailablePort(projects, firstPort = FIRST_METRO_PORT) {
  const used = new Set(projects.map((project) => project.port));
  let port = firstPort;
  while (used.has(port)) port += 1;
  return port;
}

export function detectCommand(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  if (dependencies.expo) return "npx expo start --port {port}";
  if (dependencies["react-native"]) return "npx react-native start --port {port}";
  throw new Error("Could not detect Expo or React Native. Pass --command with a {port} placeholder.");
}
