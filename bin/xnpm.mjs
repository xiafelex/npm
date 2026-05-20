#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const configDir = process.env.XNPM_CONFIG_DIR
  ? path.resolve(process.env.XNPM_CONFIG_DIR.replace(/^~(?=$|\/)/, os.homedir()))
  : path.join(os.homedir(), ".xnpm");
const configPath = path.join(configDir, "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function repoOriginLooksRight(dir) {
  try {
    const result = spawnSync("git", ["remote", "get-url", "origin"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const remote = (result.stdout || "").trim();
    return (
      remote.includes("github.com:xiafelex/npm") ||
      remote.includes("github.com/xiafelex/npm")
    );
  } catch {
    return false;
  }
}

function saveConfig(config) {
  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  } catch (error) {
    console.error(`Failed to write config at ${configPath}`);
    console.error("Try one of these:");
    console.error("  1. export XNPM_CONFIG_DIR=/some/writable/path");
    console.error("  2. export NPM_CMD_REPO=/path/to/npm");
    throw error;
  }
}

function isRepoRoot(dir) {
  if (!dir) return false;
  const pkg = path.join(dir, "package.json");
  if (!fs.existsSync(pkg)) return false;
  try {
    const json = JSON.parse(fs.readFileSync(pkg, "utf8"));
    return Boolean(json.scripts && json.scripts["doctor:sync"]);
  } catch {
    return false;
  }
}

function scoreRepoRoot(dir) {
  if (!isRepoRoot(dir)) return -1;
  let score = 1;
  if (repoOriginLooksRight(dir)) score += 10;
  return score;
}

function listCandidateRoots() {
  return [
    os.homedir(),
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Documents/Codex"),
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Downloads"),
    "/private/tmp",
  ].filter((p, i, arr) => p && arr.indexOf(p) === i && fs.existsSync(p));
}

function findRepoUnder(root, maxDepth = 3) {
  const results = [];

  function walk(current, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    const score = scoreRepoRoot(current);
    if (score > 0) {
      results.push({ dir: current, score });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      walk(path.join(current, entry.name), depth + 1);
    }
  }

  walk(root, 0);
  return results;
}

function autoLocateRepoRoot() {
  const all = [];
  for (const root of listCandidateRoots()) {
    all.push(...findRepoUnder(root, 3));
  }
  all.sort((a, b) => b.score - a.score || a.dir.length - b.dir.length);
  return all[0]?.dir || null;
}

function resolveRepoRoot() {
  const envPath = process.env.NPM_CMD_REPO;
  if (isRepoRoot(envPath)) return path.resolve(envPath);

  const config = loadConfig();
  if (isRepoRoot(config.repoRoot)) return path.resolve(config.repoRoot);

  let current = process.cwd();
  while (true) {
    if (isRepoRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (isRepoRoot(packageRoot)) return packageRoot;
  const auto = autoLocateRepoRoot();
  if (auto) return auto;
  return null;
}

function usage() {
  console.log(`xnpm - command runner for xiafelex/npm

Usage:
  xnpm use /path/to/npm-repo
  xnpm locate
  xnpm where
  xnpm doctor:sync
  xnpm help
  xnpm help:dingtalk-wiki

Resolution order:
  1. NPM_CMD_REPO
  2. ~/.xnpm/config.json
  3. current directory and its parents
  4. bundled install root
`);
}

const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === "-h" || cmd === "--help") {
  usage();
  process.exit(0);
}

if (cmd === "use") {
  const target = rest[0];
  if (!target) {
    console.error("Missing repo path. Example: xnpm use /path/to/npm");
    process.exit(1);
  }
  const resolved = path.resolve(target.replace(/^~(?=$|\/)/, os.homedir()));
  if (!isRepoRoot(resolved)) {
    console.error(`Not a valid npm command repo: ${resolved}`);
    console.error("Expected package.json with script doctor:sync");
    process.exit(1);
  }
  const config = loadConfig();
  config.repoRoot = resolved;
  saveConfig(config);
  console.log(`Saved repo root: ${resolved}`);
  console.log(`Config file: ${configPath}`);
  process.exit(0);
}

if (cmd === "where") {
  const repoRoot = resolveRepoRoot();
  if (!repoRoot) {
    console.error("No repo root configured.");
    console.error("Run: xnpm use /path/to/npm");
    process.exit(1);
  }
  console.log(repoRoot);
  process.exit(0);
}

if (cmd === "locate") {
  const located = autoLocateRepoRoot();
  if (!located) {
    console.error("Could not auto-locate xiafelex/npm on this machine.");
    console.error("Try: xnpm use /path/to/npm");
    process.exit(1);
  }
  console.log(located);
  process.exit(0);
}

const repoRoot = resolveRepoRoot();
if (!repoRoot) {
  console.error("Could not resolve npm command repo.");
  console.error("Try one of these:");
  console.error("  export NPM_CMD_REPO=/path/to/npm");
  console.error("  xnpm use /path/to/npm");
  process.exit(1);
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCmd, ["run", cmd, ...rest], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
