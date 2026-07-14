import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

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

  async ensure({
    platform,
    projectName,
    device,
    deviceType,
    runtime,
    systemImage,
    appId,
    port,
    open = true,
    timeout = 180_000
  }) {
    if (platform === "ios") {
      const desiredDevice = device || dedicatedSimulatorName(projectName, platform);
      return this.ensureIOS({ device: desiredDevice, deviceType, runtime, appId, open, timeout });
    }
    if (platform === "android") {
      const desiredDevice = device || dedicatedSimulatorName(projectName, platform);
      return this.ensureAndroid({ device: desiredDevice, deviceType, systemImage, appId, port, timeout });
    }
    throw new Error(`Unsupported simulator platform: ${platform}. Use ios or android.`);
  }

  async ensureIOS({ device, deviceType, runtime, appId, open, timeout }) {
    const output = await this.run(this.binaries.xcrun, ["simctl", "list", "devices", "available", "--json"]);
    const listing = JSON.parse(output);
    let selected = selectIOSDevice(listing, device);
    let created = false;
    if (!selected && looksLikeIOSDeviceId(device)) {
      throw new Error(`No available iOS simulator matches ${device}`);
    }
    if (!selected) {
      const template = selectIOSCreationTemplate(listing);
      const targetDeviceType = deviceType || template?.deviceTypeIdentifier;
      const targetRuntime = runtime || template?.runtime;
      if (!targetDeviceType || !targetRuntime) {
        throw new Error(
          `Cannot create iOS simulator ${device}: install an iPhone simulator runtime in Xcode or configure rnServer.ios.deviceType and rnServer.ios.runtime`
        );
      }
      const udid = (await this.run(this.binaries.xcrun, [
        "simctl", "create", device, targetDeviceType, targetRuntime
      ])).trim();
      selected = { name: device, udid, state: "Shutdown", runtime: targetRuntime };
      created = true;
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
      created,
      app: appId ? { id: appId, state: "launched" } : null
    };
  }

  async ensureAndroid({ device, deviceType, systemImage, appId, port, timeout }) {
    let selected = await this.findAndroidEmulator(device);
    let created = false;
    if (!selected) {
      const avds = parseLines(await this.run(this.binaries.emulator, ["-list-avds"]));
      let avdName = avds.find((name) => name === device);
      if (!avdName) {
        const image = systemImage || discoverAndroidSystemImage(this.binaries.androidHome);
        if (!image) {
          throw new Error(
            `Cannot create Android AVD ${device}: install an Android system image or configure rnServer.android.systemImage`
          );
        }
        const createArgs = ["create", "avd", "-n", device, "-k", image, "-f"];
        if (deviceType) createArgs.push("-d", deviceType);
        try {
          await this.run(this.binaries.avdmanager, createArgs, { timeout: 120_000, input: "no\n" });
        } catch (error) {
          if (/JDK 17|Java 17|requires JDK/i.test(error.message)) {
            throw new Error(`Cannot create Android AVD ${device}: avdmanager requires JDK 17 or later`);
          }
          throw error;
        }
        avdName = device;
        created = true;
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
      created,
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

export function selectIOSCreationTemplate(listing) {
  const devices = Object.entries(listing.devices || {}).flatMap(([runtime, entries]) =>
    entries.filter((entry) => entry.isAvailable !== false && entry.deviceTypeIdentifier?.includes("iPhone"))
      .map((entry) => ({ ...entry, runtime }))
  );
  return devices.sort((left, right) => runtimeVersion(right.runtime) - runtimeVersion(left.runtime))[0] || null;
}

export function dedicatedSimulatorName(projectName, platform) {
  const name = String(projectName || "").trim();
  if (!name) throw new Error("A project name is required to select its dedicated simulator");
  if (platform === "android") {
    const safeName = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
    return `${safeName || "ReactNative"}_Sim`;
  }
  return `${name} Sim`;
}

export function selectAndroidSystemImage(packages, arch = process.arch) {
  const architectureOrder = arch === "arm64"
    ? ["arm64-v8a", "aarch64", "x86_64", "x86"]
    : ["x86_64", "x86", "arm64-v8a", "aarch64"];
  const tagOrder = ["google_apis_playstore", "google_apis", "default"];
  return [...packages].sort((left, right) => {
    const leftParts = left.split(";");
    const rightParts = right.split(";");
    const apiDifference = androidApi(rightParts[1]) - androidApi(leftParts[1]);
    if (apiDifference) return apiDifference;
    const leftArchitecture = architectureOrder.indexOf(leftParts[3]);
    const rightArchitecture = architectureOrder.indexOf(rightParts[3]);
    if (leftArchitecture !== rightArchitecture) {
      return normalizedRank(leftArchitecture) - normalizedRank(rightArchitecture);
    }
    return normalizedRank(tagOrder.indexOf(leftParts[2])) - normalizedRank(tagOrder.indexOf(rightParts[2]));
  })[0] || null;
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
    deviceType: options["device-type"] || platformConfig.deviceType,
    runtime: options.runtime || platformConfig.runtime,
    systemImage: options["system-image"] || platformConfig.systemImage,
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
    ], "emulator"),
    avdmanager: firstExisting([
      process.env.RN_SERVER_AVDMANAGER,
      path.join(androidHome, "cmdline-tools", "latest", "bin", "avdmanager"),
      path.join(androidHome, "tools", "bin", "avdmanager")
    ], "avdmanager"),
    androidHome
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

function discoverAndroidSystemImage(androidHome) {
  if (!androidHome) return null;
  const root = path.join(androidHome, "system-images");
  if (!fs.existsSync(root)) return null;
  const packages = [];
  for (const api of directoryNames(root)) {
    for (const tag of directoryNames(path.join(root, api))) {
      for (const architecture of directoryNames(path.join(root, api, tag))) {
        packages.push(`system-images;${api};${tag};${architecture}`);
      }
    }
  }
  return selectAndroidSystemImage(packages);
}

function directoryNames(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function looksLikeIOSDeviceId(value) {
  return /^[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i.test(value || "");
}

function androidApi(value = "") {
  return Number(value.match(/android-(\d+)/)?.[1] || 0);
}

function normalizedRank(value) {
  return value === -1 ? Number.MAX_SAFE_INTEGER : value;
}

function runCommand(file, args, { timeout = 30_000, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`${path.basename(file)} ${args.join(" ")} failed: ${error.message}`));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve(stdout);
      const detail = stderr.trim() || stdout.trim() || (signal ? `terminated by ${signal}` : `exited with code ${code}`);
      reject(new Error(`${path.basename(file)} ${args.join(" ")} failed: ${detail}`));
    });
    child.stdin.end(input);
  });
}

function spawnDetached(file, args) {
  const child = spawn(file, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
