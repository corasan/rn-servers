import http from "node:http";

export function createApi({ registry, supervisor, onShutdown }) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      if (request.method === "GET" && url.pathname === "/health") {
        return json(response, 200, { ok: true, pid: process.pid });
      }
      if (request.method === "GET" && url.pathname === "/projects") {
        return json(response, 200, registry.all().map((project) => withStatus(project, supervisor)));
      }
      if (request.method === "GET" && url.pathname === "/resolve") {
        const directory = url.searchParams.get("directory");
        const project = findProjectForDirectory(registry.all(), directory);
        if (!project) return json(response, 404, { error: `No registered project contains ${directory}` });
        return json(response, 200, withStatus(project, supervisor));
      }
      if (request.method === "POST" && url.pathname === "/projects") {
        const project = registry.add(await body(request));
        if (project.autoStart) supervisor.start(project);
        return json(response, 201, withStatus(project, supervisor));
      }
      if (segments[0] === "projects" && segments[1]) {
        let project = registry.find(segments[1]);
        if (!project) return json(response, 404, { error: `Unknown project: ${segments[1]}` });
        if (request.method === "DELETE" && segments.length === 2) {
          await supervisor.stop(project);
          registry.remove(project.id);
          return json(response, 200, project);
        }
        if (request.method === "POST" && segments[2] === "start") {
          return json(response, 200, { ...project, runtime: supervisor.start(project) });
        }
        if (request.method === "POST" && segments[2] === "stop") {
          return json(response, 200, { ...project, runtime: await supervisor.stop(project) });
        }
        if (request.method === "POST" && segments[2] === "restart") {
          await supervisor.stop(project);
          return json(response, 200, { ...project, runtime: supervisor.start(project) });
        }
        if (request.method === "POST" && segments[2] === "tailscale" && segments[3] === "enable") {
          project = registry.update(project.id, { tailscale: true });
          supervisor.enableTailscale(project);
          return json(response, 200, withStatus(project, supervisor));
        }
        if (request.method === "POST" && segments[2] === "tailscale" && segments[3] === "disable") {
          supervisor.disableTailscale(project);
          project = registry.update(project.id, { tailscale: false });
          return json(response, 200, withStatus(project, supervisor));
        }
      }
      if (request.method === "POST" && url.pathname === "/shutdown") {
        json(response, 202, { ok: true });
        setImmediate(onShutdown);
        return;
      }
      json(response, 404, { error: "Not found" });
    } catch (error) {
      json(response, 400, { error: error.message });
    }
  });
}

function findProjectForDirectory(projects, directory) {
  if (!directory) return null;
  const normalized = directory.replace(/\/+$/, "");
  return projects
    .filter((project) => normalized === project.directory || normalized.startsWith(`${project.directory}/`))
    .sort((left, right) => right.directory.length - left.directory.length)[0] || null;
}

function withStatus(project, supervisor) {
  return { ...project, runtime: supervisor.status(project) };
}

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(value)}\n`);
}

async function body(request) {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 1_000_000) throw new Error("Request body is too large");
  }
  return value ? JSON.parse(value) : {};
}
