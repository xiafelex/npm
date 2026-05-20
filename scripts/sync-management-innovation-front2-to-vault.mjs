import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadDotEnv } from "./env.mjs";

loadDotEnv();

const vaultRoot = process.env.MI_VAULT_ROOT || "/Users/felex/Documents/Codex/ai-memory-vault-local";
const autoCommit = process.env.MI_VAULT_GIT_COMMIT === "1";
const autoPush = process.env.MI_VAULT_GIT_PUSH === "1";
const sourceUiDir = process.env.MI_SOURCE_UI_DIR || "docs/wiki-md/管理创新-前两层";
const sourceCatalogDir = process.env.MI_SOURCE_CATALOG_DIR || "data/wiki-sections/管理创新-前两层";
const vaultImportRoot = process.env.MI_VAULT_IMPORT_ROOT
  ? join(vaultRoot, process.env.MI_VAULT_IMPORT_ROOT)
  : join(vaultRoot, "memory/imports/dingtalk/tech_center/management_innovation");
const vaultRawMdDir = join(vaultImportRoot, "raw-md");
const vaultCatalogDir = join(vaultImportRoot, "catalog");
const vaultSyncStatePath = join(vaultCatalogDir, "vault-sync-status.json");

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, value);
}

function copyIfExists(src, dest) {
  if (!existsSync(src)) return false;
  ensureDir(dirname(dest));
  cpSync(src, dest, { force: true });
  return true;
}

function git(args) {
  return execFileSync("git", args, { cwd: vaultRoot, encoding: "utf8" }).trim();
}

function tryGit(args) {
  try {
    return { ok: true, output: git(args) };
  } catch (error) {
    return { ok: false, error };
  }
}

function detectPushTarget() {
  const branch = tryGit(["branch", "--show-current"]);
  const branchName = branch.ok ? branch.output.trim() : "";
  const upstream = tryGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const upstreamRef = upstream.ok ? upstream.output.trim() : "";
  const [remoteName = "origin", upstreamBranchName = ""] = upstreamRef.split("/");
  if (upstreamBranchName === "main") {
    return { remoteName, targetBranch: "main", mode: "head_to_main" };
  }
  if (branchName) {
    return { remoteName, targetBranch: branchName, mode: "head_to_same_name" };
  }
  return { remoteName: "origin", targetBranch: "main", mode: "head_to_main" };
}

function main() {
  ensureDir(vaultRawMdDir);
  ensureDir(vaultCatalogDir);

  const copiedDocs = [];
  for (const name of readdirSync(sourceUiDir).filter((item) => item.endsWith(".md"))) {
    const src = join(sourceUiDir, name);
    const dest = join(vaultRawMdDir, name);
    copyIfExists(src, dest);
    copiedDocs.push(name);
  }

  for (const name of ["manifest.json"]) {
    const src = join(sourceUiDir, name);
    const dest = join(vaultCatalogDir, name);
    copyIfExists(src, dest);
  }

  for (const name of [
    "sync-registry.json",
    "SYNC_REGISTRY.md",
    "SYNC_ANALYSIS.json",
    "CONTENT_SIGNAL_REPORT.json",
    "CONTENT_SIGNAL_REPORT.md",
    "TOP20_READY.json",
    "TOP20_READY.md"
  ]) {
    const src = join(sourceCatalogDir, name);
    const dest = join(vaultCatalogDir, name);
    copyIfExists(src, dest);
  }

  const registry = readJson(join(sourceCatalogDir, "sync-registry.json"), { items: [] });
  const items = registry.items || [];
  const uiCurrent = items.filter((item) => item.syncState === "ui_md_current").length;
  const pending = items.filter((item) => item.needsSync !== false).length;

  const state = {
    syncedDocCount: uiCurrent,
    pendingDocCount: pending,
    lastSyncedAt: new Date().toISOString(),
    copiedFileCount: copiedDocs.length,
    copiedFilesSample: copiedDocs.slice(0, 20),
    lastCommit: null,
    lastPush: null,
    lastCommitError: null,
    lastPushError: null
  };

  if (autoCommit) {
    const addResult = tryGit(["add", "--sparse", "--", "memory/imports/dingtalk/tech_center/management_innovation"]);
    if (!addResult.ok) {
      state.lastCommitError = String(addResult.error?.message || addResult.error);
    } else {
      const commitResult = tryGit(["commit", "-m", `Sync management innovation batch (${uiCurrent} docs)`]);
      if (commitResult.ok) {
        state.lastCommit = git(["rev-parse", "HEAD"]);
      } else {
        state.lastCommitError = String(commitResult.error?.message || commitResult.error);
        const headResult = tryGit(["rev-parse", "HEAD"]);
        if (headResult.ok) state.lastCommit = headResult.output;
      }
    }
  }

  if (autoPush) {
    const fetchResult = tryGit(["fetch", "--depth=1", "origin", "main"]);
    if (!fetchResult.ok) {
      state.lastPushError = String(fetchResult.error?.message || fetchResult.error);
    } else {
      const rebaseResult = tryGit(["rebase", "origin/main"]);
      if (!rebaseResult.ok) {
        state.lastPushError = String(rebaseResult.error?.message || rebaseResult.error);
      } else {
        const pushTarget = detectPushTarget();
        const pushArgs = pushTarget.mode === "head_to_main"
          ? ["push", pushTarget.remoteName, "HEAD:main"]
          : ["push", pushTarget.remoteName, "HEAD"];
        const pushResult = tryGit(pushArgs);
        if (pushResult.ok) {
          state.lastPush = new Date().toISOString();
        } else {
          state.lastPushError = String(pushResult.error?.message || pushResult.error);
        }
      }
    }
  }

  writeJson(vaultSyncStatePath, state);
  writeText(
    join(vaultCatalogDir, "vault-sync-status.md"),
    [
      "# Management Innovation Vault Sync",
      "",
      `- syncedDocCount: ${state.syncedDocCount}`,
      `- pendingDocCount: ${state.pendingDocCount}`,
      `- copiedFileCount: ${state.copiedFileCount}`,
      `- lastSyncedAt: ${state.lastSyncedAt}`,
      `- lastCommit: ${state.lastCommit || ""}`,
      `- lastPush: ${state.lastPush || ""}`,
      `- lastCommitError: ${state.lastCommitError || ""}`,
      `- lastPushError: ${state.lastPushError || ""}`,
      ""
    ].join("\n")
  );

  console.log(`Management innovation vault sync copied ${copiedDocs.length} file(s)`);
  console.log(`Management innovation syncedDocCount=${state.syncedDocCount}`);
  console.log(`Management innovation pendingDocCount=${state.pendingDocCount}`);
  if (state.lastCommit) console.log(`Management innovation lastCommit=${state.lastCommit}`);
  if (state.lastCommitError) console.log(`Management innovation lastCommitError=${state.lastCommitError}`);
  if (state.lastPush) console.log(`Management innovation lastPush=${state.lastPush}`);
  if (state.lastPushError) console.log(`Management innovation lastPushError=${state.lastPushError}`);

  if (state.lastPushError) {
    process.exitCode = 1;
  }
}

main();
