import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import test from "node:test";
import React from "react";
import { Box, Text, renderToString } from "ink";
import { run } from "../src/cli.js";
import { printProjects } from "../src/ui.js";

test("Ink renders terminal layouts without requiring a live TTY", () => {
  const output = stripVTControlCharacters(renderToString(
    React.createElement(Box, { borderStyle: "round", paddingX: 1 },
      React.createElement(Text, { color: "green", bold: true }, "rn-server")
    ),
    { columns: 60 }
  ));

  assert.match(output, /rn-server/);
  assert.match(output, /╭/);
  assert.match(output, /╰/);
});

test("long-form version flag stays machine-readable", async () => {
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (value) => { output += value; return true; };
  try {
    await run(["--version"]);
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.equal(output, "rn-server 0.1.0\n");
});

test("project cards show both tailnet and local endpoints", () => {
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (value) => { output += value; return true; };
  try {
    printProjects([{
      id: "demo",
      name: "Demo",
      directory: "/projects/demo",
      runtime: {
        state: "running",
        endpoint: "http://dev-mac.example.ts.net:8081",
        localEndpoint: "http://127.0.0.1:8081",
        tailscale: { state: "enabled" }
      }
    }]);
  } finally {
    process.stdout.write = originalWrite;
  }
  const plain = stripVTControlCharacters(output);
  assert.match(plain, /Demo/);
  assert.match(plain, /dev-mac\.example\.ts\.net:8081/);
  assert.match(plain, /127\.0\.0\.1:8081/);
  assert.match(plain, /Tailscale  enabled/);
});
