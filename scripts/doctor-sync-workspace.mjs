import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");

function run(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function repoOriginLooksRight(dir) {
  const remote = run("git", ["remote", "get-url", "origin"], dir) || "";
  return (
    remote.includes("github.com:xiafelex/npm") ||
    remote.includes("github.com/xiafelex/npm")
  );
}

function isRepoRoot(dir) {
  if (!dir) return false;
  const pkg = path.join(dir, "package.json");
  if (!exists(pkg)) return false;
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
    process.env.NPM_CMD_REPO,
    process.env.SYNC_WORKSPACE_DIR,
    os.homedir(),
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Documents/Codex"),
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Downloads"),
    "/private/tmp",
  ].filter((p, i, arr) => p && arr.indexOf(p) === i && exists(p));
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
    if (score > 0) results.push({ dir: current, score });

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
    if (isRepoRoot(root)) {
      all.push({ dir: root, score: scoreRepoRoot(root) });
      continue;
    }
    all.push(...findRepoUnder(root, 3));
  }
  all.sort((a, b) => b.score - a.score || a.dir.length - b.dir.length);
  return all[0]?.dir || null;
}

function isWorkspaceRoot(dir) {
  if (!dir) return false;
  return (
    exists(path.join(dir, "data", "wiki-sections")) &&
    exists(path.join(dir, "docs", "wiki-md"))
  );
}

function scoreWorkspaceRoot(dir) {
  if (!isWorkspaceRoot(dir)) return -1;
  let score = 1;
  if (exists(path.join(dir, "package.json"))) score += 1;
  if (exists(path.join(dir, "scripts", "sync-wiki-section.mjs"))) score += 2;
  if (exists(path.join(dir, "data", "wiki-sections", "管理创新"))) score += 1;
  if (exists(path.join(dir, "data", "wiki-sections", "数字驱动-数据算法研究组"))) score += 1;
  return score;
}

function findWorkspaceUnder(root, maxDepth = 4) {
  const results = [];

  function walk(current, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    const score = scoreWorkspaceRoot(current);
    if (score > 0) results.push({ dir: current, score });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      walk(path.join(current, entry.name), depth + 1);
    }
  }

  walk(root, 0);
  return results;
}

function autoLocateWorkspaceRoot(commandRepoDir) {
  const candidates = [
    process.env.SYNC_WORKSPACE_DIR,
    commandRepoDir,
    os.homedir(),
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Documents/Codex"),
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Downloads"),
    "/private/tmp",
  ].filter((p, i, arr) => p && arr.indexOf(p) === i && exists(p));

  const all = [];
  for (const root of candidates) {
    if (isWorkspaceRoot(root)) {
      all.push({ dir: root, score: scoreWorkspaceRoot(root) });
      continue;
    }
    all.push(...findWorkspaceUnder(root, 4));
  }
  all.sort((a, b) => b.score - a.score || a.dir.length - b.dir.length);
  return all[0]?.dir || null;
}

function parseDotEnv(filePath) {
  const out = {};
  if (!exists(filePath)) return out;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function gitSummary(repoDir) {
  if (!repoDir || !exists(path.join(repoDir, ".git"))) return null;
  const branch = run("git", ["branch", "--show-current"], repoDir) || "(detached)";
  const remote = run("git", ["remote", "get-url", "origin"], repoDir) || "(no origin)";
  const statusShort = run("git", ["status", "--short"], repoDir) || "";
  const lastCommit = run("git", ["log", "-1", "--pretty=%h %s"], repoDir) || "(no commits)";
  return {
    repoDir,
    branch,
    remote,
    clean: statusShort === "",
    statusShort,
    lastCommit,
  };
}

function findMemoryVaultDir() {
  const candidates = [
    process.env.MEMORY_VAULT_DIR,
    path.join(process.cwd(), "..", "ai-memory-vault"),
    path.join(process.cwd(), "..", "ai-memory-vault-local"),
    path.join(os.homedir(), "Documents/Codex/ai-memory-vault"),
    path.join(os.homedir(), "Documents/Codex/ai-memory-vault-local"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (exists(candidate) && exists(path.join(candidate, ".git"))) return candidate;
  }
  return null;
}

function envSummary(repoDir) {
  const fileEnv = {
    ...parseDotEnv(path.join(repoDir, ".env.shared")),
    ...parseDotEnv(path.join(repoDir, ".env")),
  };
  const required = [
    "DINGTALK_APP_KEY",
    "DINGTALK_APP_SECRET",
    "DINGTALK_OPERATOR_ID",
  ];
  return required.map((name) => ({
    name,
    present: Boolean(process.env[name] || fileEnv[name]),
    length: (process.env[name] || fileEnv[name])?.length ?? 0,
    source: process.env[name] ? "env" : fileEnv[name] ? "file" : "missing",
  }));
}

function sectionSummary(baseDir, name, label, manifestDir) {
  const registryPath = path.join(baseDir, "data/wiki-sections", name, "sync-registry.json");
  const analysisPath = path.join(baseDir, "data/wiki-sections", name, "SYNC_ANALYSIS.json");
  const reportPath = path.join(baseDir, "data/wiki-sections", name, "CONTENT_SIGNAL_REPORT.json");
  const manifestPath = manifestDir
    ? path.join(baseDir, "docs/wiki-md", manifestDir, "manifest.json")
    : null;

  const registry = readJson(registryPath);
  const analysis = readJson(analysisPath);
  const report = readJson(reportPath);
  const manifest = manifestPath ? readJson(manifestPath) : null;

  const registryCount = Array.isArray(registry?.entries)
    ? registry.entries.length
    : Array.isArray(registry)
      ? registry.length
      : typeof registry?.totalEntries === "number"
        ? registry.totalEntries
        : null;

  const reportSummary = report?.summary || {};
  const analysisSummary = analysis?.summary || {};
  const manifestCount = Array.isArray(manifest?.items)
    ? manifest.items.length
    : Array.isArray(manifest)
      ? manifest.length
      : typeof manifest?.total === "number"
        ? manifest.total
        : null;

  return {
    label,
    name,
    hasRegistry: Boolean(registry),
    registryCount,
    readyToGrab: reportSummary.readyToGrabCount ?? reportSummary.readyCount ?? null,
    pending: analysisSummary.pendingCount ?? reportSummary.pendingCount ?? null,
    uiCurrent: analysisSummary.uiMdCurrentCount ?? null,
    manifestCount,
  };
}

const cwd = process.cwd();
const repoRoot = autoLocateRepoRoot() || (isRepoRoot(packageRoot) ? packageRoot : cwd);
const workspaceRoot = autoLocateWorkspaceRoot(repoRoot);
const commandRepo = gitSummary(repoRoot);
const memoryVaultDir = findMemoryVaultDir();
const memoryRepo = memoryVaultDir ? gitSummary(memoryVaultDir) : null;
const env = envSummary(repoRoot);

const sections = [
  sectionSummary(workspaceRoot || repoRoot, "技术中心-全库", "技术中心总表", "技术中心-全库"),
  sectionSummary(workspaceRoot || repoRoot, "管理创新", "管理创新", "管理创新"),
  sectionSummary(workspaceRoot || repoRoot, "管理创新-前两层", "管理创新-前两层", "管理创新-前两层"),
  sectionSummary(workspaceRoot || repoRoot, "数字驱动", "数字驱动", "数字驱动"),
  sectionSummary(workspaceRoot || repoRoot, "数字驱动-数据算法研究组", "数字驱动-数据算法研究组", "数字驱动-数据算法研究组"),
  sectionSummary(workspaceRoot || repoRoot, "中心办公", "中心办公", "中心办公"),
  sectionSummary(workspaceRoot || repoRoot, "中心办公-会议培训-公司职能部门月度汇报", "会议纪要", "中心办公-会议培训-公司职能部门月度汇报"),
];

console.log("Multi-device Sync Doctor");
console.log("");

console.log("1. 当前命令仓");
if (commandRepo) {
  console.log(`  - path: ${commandRepo.repoDir}`);
  console.log(`  - branch: ${commandRepo.branch}`);
  console.log(`  - remote: ${commandRepo.remote}`);
  console.log(`  - clean: ${commandRepo.clean ? "yes" : "no"}`);
  console.log(`  - last commit: ${commandRepo.lastCommit}`);
} else {
  console.log("  - 当前目录不是 Git 仓库");
  console.log(`  - cwd: ${cwd}`);
  console.log(`  - detected repo root: ${repoRoot}`);
}
console.log("");

console.log("2. 执行工作区");
if (workspaceRoot) {
  console.log(`  - path: ${workspaceRoot}`);
  console.log(`  - data/wiki-sections: ${exists(path.join(workspaceRoot, "data", "wiki-sections")) ? "yes" : "no"}`);
  console.log(`  - docs/wiki-md: ${exists(path.join(workspaceRoot, "docs", "wiki-md")) ? "yes" : "no"}`);
} else {
  console.log("  - 未自动找到执行工作区");
  console.log("  - 可设置环境变量 SYNC_WORKSPACE_DIR=/path/to/workspace");
}
console.log("");

console.log("3. 记忆仓");
if (memoryRepo) {
  console.log(`  - path: ${memoryRepo.repoDir}`);
  console.log(`  - branch: ${memoryRepo.branch}`);
  console.log(`  - remote: ${memoryRepo.remote}`);
  console.log(`  - clean: ${memoryRepo.clean ? "yes" : "no"}`);
  console.log(`  - last commit: ${memoryRepo.lastCommit}`);
} else {
  console.log("  - 未自动找到记忆仓");
  console.log("  - 可设置环境变量 MEMORY_VAULT_DIR=/path/to/ai-memory-vault");
}
console.log("");

console.log("4. 环境变量");
for (const item of env) {
  console.log(`  - ${item.name}: ${item.present ? `present via ${item.source} (len=${item.length})` : "missing"}`);
}
console.log("");

console.log("5. 本地板块状态");
for (const section of sections) {
  console.log(`  - ${section.label}`);
  console.log(`    registry: ${section.hasRegistry ? "yes" : "no"}`);
  if (section.registryCount != null) console.log(`    registryCount: ${section.registryCount}`);
  if (section.readyToGrab != null) console.log(`    readyToGrab: ${section.readyToGrab}`);
  if (section.pending != null) console.log(`    pending: ${section.pending}`);
  if (section.uiCurrent != null) console.log(`    uiCurrent: ${section.uiCurrent}`);
  if (section.manifestCount != null) console.log(`    manifestCount: ${section.manifestCount}`);
}
console.log("");

console.log("6. 建议");
if (!env.every((item) => item.present)) {
  console.log("  - 先补 .env，再跑抓取命令");
}
if (!workspaceRoot) {
  console.log("  - 先设置 SYNC_WORKSPACE_DIR，避免查不到真正的执行工作区");
}
if (!memoryRepo) {
  console.log("  - 先设置 MEMORY_VAULT_DIR，避免回传状态时找不到记忆仓");
}
console.log("  - 想查现在还能抓什么：npm run help:query");
console.log("  - 想看钉钉知识库类命令：npm run help:dingtalk-wiki");
console.log("  - 想看钉钉日志类命令：npm run help:dingtalk-logs");
console.log("  - 想看钉钉会议纪要类命令：npm run help:dingtalk-meeting");
