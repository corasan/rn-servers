import assert from "node:assert/strict";
import test from "node:test";
import { SimulatorManager, parseAdbDevices, readyConfiguration, selectIOSDevice } from "../src/simulators.js";

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
  assert.deepEqual(result.app, { id: "com.example.app", state: "launched" });
  assert.deepEqual(calls, [
    ["xcrun", "simctl", "list", "devices", "available", "--json"],
    ["xcrun", "simctl", "boot", "NEW"],
    ["xcrun", "simctl", "bootstatus", "NEW", "-b"],
    ["open", "-a", "Simulator", "--args", "-CurrentDeviceUDID", "NEW"],
    ["xcrun", "simctl", "launch", "NEW", "com.example.app"]
  ]);
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
  assert.deepEqual(result.portReverse, { device: 8087, host: 8087 });
  assert.ok(calls.some((call) => call.join(" ") === "adb -s emulator-5554 reverse tcp:8087 tcp:8087"));
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
