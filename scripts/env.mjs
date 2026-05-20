import { readFileSync, existsSync } from "node:fs";

export function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

export function env(name, fallback = "") {
  return process.env[name] ?? fallback;
}

export function csv(name) {
  return env(name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function requireEnv(names) {
  const missing = names.filter((name) => !env(name));
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
