import { execFileSync } from "node:child_process";

export class TailscaleServe {
  constructor({ run = runTailscale } = {}) {
    this.run = run;
    this.projects = new Map();
    this.identity = null;
  }

  enable(project) {
    try {
      const identity = this.getIdentity();
      this.run(["serve", "--bg", `--tcp=${project.port}`, `tcp://127.0.0.1:${project.port}`]);
      const value = {
        state: "enabled",
        endpoint: `http://${identity.dnsName}:${project.port}`,
        dnsName: identity.dnsName,
        error: null
      };
      this.projects.set(project.id, value);
      return value;
    } catch (error) {
      const value = { state: "failed", endpoint: null, dnsName: null, error: error.message };
      this.projects.set(project.id, value);
      return value;
    }
  }

  disable(project) {
    try {
      this.run(["serve", `--tcp=${project.port}`, "off"]);
      const value = { state: "disabled", endpoint: null, dnsName: this.identity?.dnsName || null, error: null };
      this.projects.set(project.id, value);
      return value;
    } catch (error) {
      const value = { state: "failed", endpoint: null, dnsName: this.identity?.dnsName || null, error: error.message };
      this.projects.set(project.id, value);
      return value;
    }
  }

  status(project) {
    return this.projects.get(project.id) || {
      state: project.tailscale ? "pending" : "disabled",
      endpoint: null,
      dnsName: this.identity?.dnsName || null,
      error: null
    };
  }

  getIdentity() {
    if (this.identity) return this.identity;
    const status = JSON.parse(this.run(["status", "--json"]));
    const dnsName = status.Self?.DNSName?.replace(/\.$/, "");
    if (!dnsName) throw new Error("Tailscale is not connected or MagicDNS is unavailable");
    this.identity = { dnsName };
    return this.identity;
  }
}

function runTailscale(args) {
  try {
    return execFileSync("tailscale", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000
    });
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Tailscale is not installed or is not on PATH");
    const detail = error.stderr?.trim() || error.stdout?.trim() || error.message;
    throw new Error(`Tailscale command failed: ${detail}`);
  }
}
