import { CONTROL_PORT, HOST } from "./constants.js";

export async function request(pathname, { method = "GET", data, timeout = 2000 } = {}) {
  let response;
  try {
    response = await fetch(`http://${HOST}:${CONTROL_PORT}${pathname}`, {
      method,
      headers: data ? { "content-type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(timeout)
    });
  } catch {
    throw new Error("The rn-server daemon is not running");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}
