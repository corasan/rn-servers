import os from "node:os";
import path from "node:path";

export const HOST = process.env.RN_SERVER_HOST || "127.0.0.1";
export const CONTROL_PORT = Number(process.env.RN_SERVER_CONTROL_PORT || 7231);
export const HOME = process.env.RN_SERVER_HOME || path.join(os.homedir(), ".rn-server");
export const REGISTRY_FILE = path.join(HOME, "projects.json");
export const DAEMON_PID_FILE = path.join(HOME, "daemon.pid");
export const DAEMON_LOG_FILE = path.join(HOME, "daemon.log");
export const LOGS_DIR = path.join(HOME, "logs");
export const FIRST_METRO_PORT = 8081;
