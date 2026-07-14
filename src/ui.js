import React from "react";
import { Box, Text, renderToString } from "ink";

const h = React.createElement;

export function printMessage(title, detail, tone = "green") {
  print(h(Panel, { title, detail, tone }));
}

export function printProject(project, message) {
  print(h(Box, { flexDirection: "column" },
    message ? h(Text, { color: "green" }, `✓ ${message}`) : null,
    h(ProjectCard, { project })
  ));
}

export function printProjects(projects) {
  print(h(Box, { flexDirection: "column" },
    h(Header),
    h(Text, { bold: true }, `${projects.length} registered project${projects.length === 1 ? "" : "s"}`),
    ...projects.map((project) => h(ProjectCard, { key: project.id, project }))
  ));
}

export function printTailscale(project) {
  const tailscale = project.runtime.tailscale;
  const tone = stateColor(tailscale.state);
  print(h(Box, { flexDirection: "column" },
    h(Header),
    h(Text, null,
      h(Text, { bold: true }, project.name),
      h(Text, { dimColor: true }, "  Tailscale Serve")
    ),
    h(Text, { color: tone }, `${stateGlyph(tailscale.state)} ${tailscale.state}`),
    tailscale.endpoint ? h(Text, { color: "cyan" }, tailscale.endpoint) : null,
    tailscale.error ? h(Text, { color: "red" }, tailscale.error) : null
  ));
}

export function printReady(result) {
  print(h(Box, { flexDirection: "column" },
    h(Header),
    h(Text, { color: "green", bold: true }, `✓ ${result.project.name} is ready`),
    h(Box, { marginTop: 1, flexDirection: "column", borderStyle: "round", borderColor: "green", paddingX: 1 },
      h(Text, null, h(Text, { bold: true }, "Metro      "), h(Text, { color: "cyan" }, result.metro.endpoint)),
      h(Text, null, h(Text, { bold: true }, "Simulator  "), `${result.simulator.name} (${result.simulator.platform})`),
      h(Text, { dimColor: true }, `Device ID   ${result.simulator.id}`),
      result.app ? h(Text, null, h(Text, { bold: true }, "App        "), `${result.app.id} · ${result.app.state}`) : null
    ),
    h(Text, { dimColor: true }, "Tip: add --json for the stable agent contract.")
  ));
}

export function printDaemon(running, detail) {
  print(h(Box, { flexDirection: "column" },
    h(Header),
    h(Text, { color: running ? "green" : "yellow" },
      `${running ? "●" : "○"} Daemon ${running ? "running" : "stopped"}`
    ),
    detail ? h(Text, { dimColor: true }, detail) : null
  ));
}

export function printLogs(project, content) {
  if (!process.stdout.isTTY) return writeRaw(content.endsWith("\n") ? content : `${content}\n`);
  print(h(Box, { flexDirection: "column" },
    h(Text, null,
      h(Text, { bold: true, color: "magenta" }, project.name),
      h(Text, { dimColor: true }, ` · ${project.runtime.logFile}`)
    ),
    h(Text, null, content)
  ));
}

export function printHelp() {
  print(h(Box, { flexDirection: "column" },
    h(Header),
    h(Text, null, "Keep React Native and Expo development servers running at stable endpoints."),
    h(Section, { title: "Projects", rows: [
      ["add [directory]", "Register and start a project"],
      ["list", "Show registered projects and endpoints"],
      ["endpoint [directory] [--json]", "Resolve the containing project"],
      ["ready [project] [--platform ios|android] [--json]", "Start Metro and prepare a simulator"],
      ["start|stop|restart <project>", "Control a Metro server"],
      ["logs <project> [--lines 80]", "Show recent Metro output"],
      ["remove <project>", "Stop and unregister a project"]
    ] }),
    h(Section, { title: "Tailnet", rows: [
      ["add [directory] --tailscale", "Register with private tailnet access"],
      ["tailscale enable|disable|status <project>", "Manage Tailscale Serve"]
    ] }),
    h(Section, { title: "Daemon", rows: [
      ["daemon start|stop|status", "Control the background supervisor"]
    ] }),
    h(Text, { dimColor: true }, "Options: --name NAME  --port PORT  --command COMMAND  --no-start  --tailscale")
  ));
}

export function printError(error) {
  print(h(Panel, { title: "Command failed", detail: error.message, tone: "red", glyph: "✖" }), process.stderr);
}

export function writeRaw(value) {
  process.stdout.write(value);
}

function Header() {
  return h(Box, null,
    h(Text, { bold: true, color: "magenta" }, "rn-server"),
    h(Text, { dimColor: true }, "  Metro, kept running")
  );
}

function ProjectCard({ project }) {
  const runtime = project.runtime;
  const tailscale = runtime.tailscale;
  return h(Box, {
    flexDirection: "column",
    borderStyle: "round",
    borderColor: stateColor(runtime.state),
    paddingX: 1,
    marginTop: 1
  },
  h(Box, null,
    h(Text, { color: stateColor(runtime.state) }, `${stateGlyph(runtime.state)} `),
    h(Text, { bold: true }, project.name),
    h(Text, { dimColor: true }, `  ${runtime.state}`)
  ),
  h(Text, { color: "cyan" }, runtime.endpoint),
  runtime.localEndpoint !== runtime.endpoint
    ? h(Text, { dimColor: true }, `local  ${runtime.localEndpoint}`)
    : null,
  h(Text, { dimColor: true }, project.directory),
  tailscale && tailscale.state !== "disabled"
    ? h(Text, { color: stateColor(tailscale.state) }, `Tailscale  ${tailscale.state}${tailscale.error ? ` · ${tailscale.error}` : ""}`)
    : null
  );
}

function Section({ title, rows }) {
  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { bold: true, color: "cyan" }, title),
    ...rows.map(([command, description]) => h(Box, { key: command, flexDirection: "column", paddingLeft: 2 },
      h(Text, { color: "green" }, `rn-server ${command}`),
      h(Box, { paddingLeft: 2 }, h(Text, { dimColor: true }, description))
    ))
  );
}

function Panel({ title, detail, tone, glyph = "✓" }) {
  return h(Box, { flexDirection: "column", borderStyle: "round", borderColor: tone, paddingX: 1 },
    h(Text, { bold: true, color: tone }, `${glyph} ${title}`),
    detail ? h(Text, null, detail) : null
  );
}

function stateColor(state) {
  if (["running", "enabled"].includes(state)) return "green";
  if (["failed"].includes(state)) return "red";
  if (["pending"].includes(state)) return "yellow";
  return "gray";
}

function stateGlyph(state) {
  if (["running", "enabled"].includes(state)) return "●";
  if (state === "failed") return "✖";
  return "○";
}

function print(component, stream = process.stdout) {
  const columns = Math.max(50, stream.columns || 80);
  stream.write(`${renderToString(component, { columns })}\n`);
}
