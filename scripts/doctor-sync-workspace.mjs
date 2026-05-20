import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

function envSummary() {
  const required = [
    "DINGTALK_APP_KEY",
    "DINGTALK_APP_SECRET",
    "DINGTALK_OPERATOR_ID",
  ];
  return required.map((name) => ({
    name,
    present: Boolean(process.env[name]),
    length: process.env[name]?.length ?? 0,
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
const commandRepo = gitSummary(cwd);
const memoryVaultDir = findMemoryVaultDir();
const memoryRepo = memoryVaultDir ? gitSummary(memoryVaultDir) : null;
const env = envSummary();

const sections = [
  sectionSummary(cwd, "技术中心-全库", "技术中心总表", "技术中心-全库"),
  sectionSummary(cwd, "管理创新", "管理创新", "管理创新"),
  sectionSummary(cwd, "管理创新-前两层", "管理创新-前两层", "管理创新-前两层"),
  sectionSummary(cwd, "数字驱动", "数字驱动", "数字驱动"),
  sectionSummary(cwd, "数字驱动-数据算法研究组", "数字驱动-数据算法研究组", "数字驱动-数据算法研究组"),
  sectionSummary(cwd, "中心办公", "中心办公", "中心办公"),
  sectionSummary(cwd, "中心办公-会议培训-公司职能部门月度汇报", "会议纪要", "中心办公-会议培训-公司职能部门月度汇报"),
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
}
console.log("");

console.log("2. 记忆仓");
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

console.log("3. 环境变量");
for (const item of env) {
  console.log(`  - ${item.name}: ${item.present ? `present (len=${item.length})` : "missing"}`);
}
console.log("");

console.log("4. 本地板块状态");
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

console.log("5. 建议");
if (!env.every((item) => item.present)) {
  console.log("  - 先补 .env，再跑抓取命令");
}
if (!memoryRepo) {
  console.log("  - 先设置 MEMORY_VAULT_DIR，避免回传状态时找不到记忆仓");
}
console.log("  - 想查现在还能抓什么：npm run help:query");
console.log("  - 想看钉钉知识库类命令：npm run help:dingtalk-wiki");
console.log("  - 想看钉钉日志类命令：npm run help:dingtalk-logs");
console.log("  - 想看钉钉会议纪要类命令：npm run help:dingtalk-meeting");
