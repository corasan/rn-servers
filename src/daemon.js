import fs from "node:fs";
import { createApi } from "./api.js";
import { CONTROL_PORT, DAEMON_PID_FILE, HOME, HOST } from "./constants.js";
import { Registry } from "./registry.js";
import { Supervisor } from "./supervisor.js";
import { ensureDirectory } from "./utils.js";

ensureDirectory(HOME);
const registry = new Registry();
const supervisor = new Supervisor();
let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await supervisor.stopAll(registry.all());
  server.close(() => {
    try { fs.unlinkSync(DAEMON_PID_FILE); } catch {}
    process.exit(0);
  });
};

const server = createApi({ registry, supervisor, onShutdown: shutdown });
server.on("error", (error) => {
  console.error(`[rn-server] daemon error: ${error.message}`);
  process.exit(1);
});
server.listen(CONTROL_PORT, HOST, () => {
  fs.writeFileSync(DAEMON_PID_FILE, `${process.pid}\n`, { mode: 0o600 });
  console.log(`[rn-server] daemon listening at http://${HOST}:${CONTROL_PORT}`);
  for (const project of registry.all().filter((item) => item.autoStart)) {
    try { supervisor.start(project); } catch (error) {
      console.error(`[rn-server] could not start ${project.name}: ${error.message}`);
    }
  }
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (error) => {
  console.error(error);
  shutdown();
});
