import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";

export class SimulatorManager {
  constructor({
    run = runCommand,
    spawnBackground = spawnDetached,
    sleep = delay,
    binaries = defaultBinaries()
  } = {}) {
    this.run = run;
    this.spawnBackground = spawnBackground;
    this.sleep = sleep;
    this.binaries = binaries;
  }

  async ensure({ platform, device, appId, port, open = true, timeout = 180_000 }) {
    if (platform === "ios") return this.ensureIOS({ device, appId, open, timeout });
    if (platform === "android") return this.ensureAndroid({ device, appId, port, timeout });
    throw new Error(`Unsupported simulator platform: ${platform}. Use ios or android.`);
  }

  async ensureIOS({ device, appId, open, timeout }) {
    const output = await this.run(this.binaries.xcrun, ["simctl", "list", "devices", "available", "--json"]);
    const selected = selectIOSDevice(JSON.parse(output), device);
    if (!selected) {
      throw new Error(device
        ? `No available iOS simulator matches ${device}`
        : "No available iPhone simulator was found");
    }

    if (selected.state !== "Booted") {
      await this.run(this.binaries.xcrun, ["simctl", "boot", selected.udid]);
    }
    await this.run(this.binaries.xcrun, ["simctl", "bootstatus", selected.udid, "-b"], { timeout });
    if (open) {
      await this.run(this.binaries.open, ["-a", "Simulator", "--args", "-CurrentDeviceUDID", selected.udid]);
    }
    if (appId) {
      await this.run(this.binaries.xcrun, ["simctl", "launch", selected.udid, appId]);
    }

    return {
      platform: "ios",
      id: selected.udid,
      name: selected.name,
      state: "booted",
      app: appId ? { id: appId, state: "launched" } : null
    };
  }

  async ensureAndroid({ device, appId, port, timeout }) {
    let selected = await this.findAndroidEmulator(device);
    if (!selected) {
      const avds = parseLines(await this.run(this.binaries.emulator, ["-list-avds"]));
      const avdName = device ? avds.find((name) => name === device) : avds[0];
      if (!avdName) {
        throw new Error(device ? `No Android AVD matches ${device}` : "No Android AVD is configured");
      }
      this.spawnBackground(this.binaries.emulator, ["-avd", avdName]);
      selected = await this.waitForAndroidEmulator(avdName, timeout);
    }

    await this.run(this.binaries.adb, [
      "-s", selected.serial, "reverse", `tcp:${port}`, `tcp:${port}`
    ]);
    if (appId) {
      await this.run(this.binaries.adb, [
        "-s", selected.serial, "shell", "monkey", "-p", appId,
        "-c", "android.intent.category.LAUNCHER", "1"
      ]);
    }

    return {
      platform: "android",
      id: selected.serial,
      name: selected.name,
      state: "booted",
      portReverse: { device: port, host: port },
      app: appId ? { id: appId, state: "launched" } : null
    };
  }

  async findAndroidEmulator(preferredName) {
    const devices = parseAdbDevices(await this.run(this.binaries.adb, ["devices"]));
    for (const entry of devices) {
      const name = (await this.run(this.binaries.adb, ["-s", entry.serial, "emu", "avd", "name"]))
        .trim().split("\n")[0];
      if (!preferredName || name === preferredName || entry.serial === preferredName) return { ...entry, name };
    }
    return null;
  }

  async waitForAndroidEmulator(avdName, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        const selected = await this.findAndroidEmulator(avdName);
        if (selected) {
          const completed = (await this.run(this.binaries.adb, [
            "-s", selected.serial, "shell", "getprop", "sys.boot_completed"
          ])).trim();
          if (completed === "1") return selected;
        }
      } catch {}
      await this.sleep(1000);
    }
    throw new Error(`Android emulator ${avdName} did not finish booting within ${timeout / 1000} seconds`);
  }
}

export function selectIOSDevice(listing, preferred) {
  const devices = Object.entries(listing.devices || {}).flatMap(([runtime, entries]) =>
    entries.filter((entry) => entry.isAvailable !== false).map((entry) => ({ ...entry, runtime }))
  );
  if (preferred) {
    const exactIdentifier = devices.find((entry) => entry.udid === preferred);
    if (exactIdentifier) return exactIdentifier;
    return sortIOSDevices(devices.filter((entry) => entry.name === preferred))[0] || null;
  }
  return sortIOSDevices(devices.filter((entry) => entry.deviceTypeIdentifier?.includes("iPhone")))[0] || null;
}

export function parseAdbDevices(output) {
  return output.split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial?.startsWith("emulator-") && state === "device")
    .map(([serial]) => ({ serial }));
}

export function readyConfiguration(manifest, options = {}) {
  const root = manifest.rnServer || {};
  const platform = options.platform || root.platform || (process.platform === "darwin" ? "ios" : "android");
  const platformConfig = root[platform] || {};
  return {
    platform,
    device: options.device || platformConfig.device || root.device,
    appId: options["app-id"] || platformConfig.appId || root.appId,
    open: !options["no-open"]
  };
}

function defaultBinaries() {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), "Library", "Android", "sdk");
  return {
    xcrun: "/usr/bin/xcrun",
    open: "/usr/bin/open",
    adb: firstExisting([
      process.env.RN_SERVER_ADB,
      path.join(androidHome, "platform-tools", "adb"),
      "/opt/homebrew/bin/adb",
      "/usr/local/bin/adb"
    ], "adb"),
    emulator: firstExisting([
      process.env.RN_SERVER_EMULATOR,
      path.join(androidHome, "emulator", "emulator"),
      "/opt/homebrew/bin/emulator",
      "/usr/local/bin/emulator"
    ], "emulator")
  };
}

function firstExisting(candidates, fallback) {
  return candidates.filter(Boolean).find((candidate) => fs.existsSync(candidate)) || fallback;
}

function runtimeVersion(value) {
  const match = value.match(/iOS-(\d+)(?:-(\d+))?/);
  return match ? Number(match[1]) * 100 + Number(match[2] || 0) : 0;
}

function sortIOSDevices(devices) {
  return devices.sort((left, right) => {
    if (left.state === "Booted" && right.state !== "Booted") return -1;
    if (right.state === "Booted" && left.state !== "Booted") return 1;
    return runtimeVersion(right.runtime) - runtimeVersion(left.runtime);
  });
}

function parseLines(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function runCommand(file, args, { timeout = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: "utf8", timeout, maxBuffer: 10_000_000 }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      const detail = stderr.trim() || stdout.trim() || error.message;
      reject(new Error(`${path.basename(file)} ${args.join(" ")} failed: ${detail}`));
    });
  });
}

function spawnDetached(file, args) {
  const child = spawn(file, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
