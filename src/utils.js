import fs from "node:fs";
import path from "node:path";

export function slugify(value) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

export function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`Could not read ${file}: ${error.message}`);
  }
}

export function writeJsonAtomic(file, value) {
  ensureDirectory(path.dirname(file));
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function parseCommandLine(input) {
  const options = {};
  const positional = [];
  for (let index = 0; index < input.length; index += 1) {
    const token = input[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    if (inlineValue !== undefined) {
      options[rawKey] = inlineValue;
    } else if (input[index + 1] && !input[index + 1].startsWith("--")) {
      options[rawKey] = input[index + 1];
      index += 1;
    } else {
      options[rawKey] = true;
    }
  }
  return { positional, options };
}

export function quoteShell(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}
