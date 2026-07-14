import assert from "node:assert/strict";
import test from "node:test";
import {
  SimulatorManager,
  dedicatedSimulatorName,
  parseAdbDevices,
  readyConfiguration,
  selectAndroidSystemImage,
  selectIOSDevice
} from "../src/simulators.js";

const iosListing = {
  devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-25-0": [
      { name: "iPhone 16", udid: "OLD", state: "Shutdown", isAvailable: true, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-16" }
    ],
    "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [
      { name: "iPhone 17 Pro", udid: "NEW", state: "Shutdown", isAvailable: true, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro" },
      { name: "iPad Pro", udid: "IPAD", state: "Booted", isAvailable: true, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro" }
    ]
  }
};

test("selects an explicit iOS device or the newest available iPhone", () => {
  assert.equal(selectIOSDevice(iosListing).udid, "NEW");
  assert.equal(selectIOSDevice(iosListing, "OLD").name, "iPhone 16");
  assert.equal(selectIOSDevice(iosListing, "iPad Pro").udid, "IPAD");
});

test("selects the newest runtime when an iOS device name appears more than once", () => {
  const duplicate = structuredClone(iosListing);
  duplicate.devices["com.apple.CoreSimulator.SimRuntime.iOS-25-0"].push({
    name: "iPhone 17 Pro", udid: "OLD-DUPLICATE", state: "Shutdown", isAvailable: true,
    deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro"
  });
  assert.equal(selectIOSDevice(duplicate, "iPhone 17 Pro").udid, "NEW");
});

test("boots an iOS simulator, opens Simulator, and launches a configured app", async () => {
  const calls = [];
  const manager = new SimulatorManager({
    binaries: { xcrun: "xcrun", open: "open", adb: "adb", emulator: "emulator" },
    run: async (file, args) => {
      calls.push([file, ...args]);
      if (args.includes("list")) return JSON.stringify(iosListing);
      return "";
    }
  });
  const result = await manager.ensure({
    platform: "ios",
    device: "iPhone 17 Pro",
    appId: "com.example.app",
    port: 8081
  });

  assert.equal(result.id, "NEW");
  assert.equal(result.created, false);
  assert.deepEqual(result.app, { id: "com.example.app", state: "launched" });
  assert.deepEqual(calls, [
    ["xcrun", "simctl", "list", "devices", "available", "--json"],
    ["xcrun", "simctl", "boot", "NEW"],
    ["xcrun", "simctl", "bootstatus", "NEW", "-b"],
    ["open", "-a", "Simulator", "--args", "-CurrentDeviceUDID", "NEW"],
    ["xcrun", "simctl", "launch", "NEW", "com.example.app"]
  ]);
});

test("creates and boots a project-named iOS simulator when it does not exist", async () => {
  const calls = [];
  const manager = new SimulatorManager({
    binaries: { xcrun: "xcrun", open: "open", adb: "adb", emulator: "emulator" },
    run: async (file, args) => {
      calls.push([file, ...args]);
      if (args.includes("list")) return JSON.stringify(iosListing);
      if (args.includes("create")) return "PROJECT-SIM\n";
      return "";
    }
  });

  const result = await manager.ensure({ platform: "ios", projectName: "MyProject", port: 8081, open: false });

  assert.deepEqual(result, {
    platform: "ios",
    id: "PROJECT-SIM",
    name: "MyProject Sim",
    state: "booted",
    created: true,
    app: null
  });
  assert.ok(calls.some((call) => call.join(" ") === [
    "xcrun", "simctl", "create", "MyProject Sim",
    "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro",
    "com.apple.CoreSimulator.SimRuntime.iOS-26-0"
  ].join(" ")));
});

test("uses a running Android emulator and reverses the assigned Metro port", async () => {
  const calls = [];
  const manager = new SimulatorManager({
    binaries: { xcrun: "xcrun", open: "open", adb: "adb", emulator: "emulator" },
    run: async (file, args) => {
      calls.push([file, ...args]);
      if (args.length === 1 && args[0] === "devices") return "List of devices attached\nemulator-5554\tdevice\n";
      if (args.includes("name")) return "Pixel_9_Pro\nOK\n";
      return "";
    }
  });
  const result = await manager.ensure({ platform: "android", device: "Pixel_9_Pro", appId: "com.example", port: 8087 });

  assert.equal(result.id, "emulator-5554");
  assert.equal(result.created, false);
  assert.deepEqual(result.portReverse, { device: 8087, host: 8087 });
  assert.ok(calls.some((call) => call.join(" ") === "adb -s emulator-5554 reverse tcp:8087 tcp:8087"));
});

test("creates and boots a dedicated Android AVD when it does not exist", async () => {
  const calls = [];
  const spawned = [];
  let deviceChecks = 0;
  const manager = new SimulatorManager({
    binaries: {
      xcrun: "xcrun", open: "open", adb: "adb", emulator: "emulator",
      avdmanager: "avdmanager", androidHome: "/sdk"
    },
    spawnBackground: (file, args) => spawned.push([file, ...args]),
    sleep: async () => {},
    run: async (file, args, options) => {
      calls.push([file, ...args, options?.input].filter((value) => value !== undefined));
      if (file === "emulator" && args[0] === "-list-avds") return "Pixel_9_Pro\n";
      if (file === "adb" && args.length === 1 && args[0] === "devices") {
        deviceChecks += 1;
        return deviceChecks === 1
          ? "List of devices attached\n"
          : "List of devices attached\nemulator-5556\tdevice\n";
      }
      if (file === "adb" && args.includes("name")) return "My_Project_Sim\nOK\n";
      if (file === "adb" && args.includes("sys.boot_completed")) return "1\n";
      return "";
    }
  });

  const result = await manager.ensure({
    platform: "android",
    projectName: "My Project",
    systemImage: "system-images;android-36;google_apis;arm64-v8a",
    port: 8090
  });

  assert.equal(result.name, "My_Project_Sim");
  assert.equal(result.created, true);
  assert.deepEqual(spawned, [["emulator", "-avd", "My_Project_Sim"]]);
  assert.ok(calls.some((call) => call.slice(0, -1).join(" ") === [
    "avdmanager", "create", "avd", "-n", "My_Project_Sim", "-k",
    "system-images;android-36;google_apis;arm64-v8a", "-f"
  ].join(" ") && call.at(-1) === "no\n"));
});

test("derives stable project simulator names on both platforms", () => {
  assert.equal(dedicatedSimulatorName("MyProject", "ios"), "MyProject Sim");
  assert.equal(dedicatedSimulatorName("My Project", "android"), "My_Project_Sim");
});

test("prefers the newest installed Android system image for the host architecture", () => {
  const packages = [
    "system-images;android-35;google_apis_playstore;arm64-v8a",
    "system-images;android-36;default;x86_64",
    "system-images;android-36;google_apis;arm64-v8a"
  ];
  assert.equal(
    selectAndroidSystemImage(packages, "arm64"),
    "system-images;android-36;google_apis;arm64-v8a"
  );
});

test("parses ready defaults from a checked-in package manifest", () => {
  const manifest = {
    rnServer: {
      platform: "ios",
      ios: { device: "iPhone 17 Pro", appId: "com.example.app" }
    }
  };
  assert.deepEqual(readyConfiguration(manifest), {
    platform: "ios",
    device: "iPhone 17 Pro",
    deviceType: undefined,
    runtime: undefined,
    systemImage: undefined,
    appId: "com.example.app",
    open: true
  });
  assert.equal(readyConfiguration(manifest, { device: "CUSTOM", "no-open": true }).device, "CUSTOM");
  assert.equal(readyConfiguration(manifest, { device: "CUSTOM", "no-open": true }).open, false);
});

test("ADB device parsing ignores physical and offline devices", () => {
  assert.deepEqual(parseAdbDevices("List of devices attached\nemulator-5554\tdevice\nABC123\tdevice\nemulator-5556\toffline\n"), [
    { serial: "emulator-5554" }
  ]);
});
