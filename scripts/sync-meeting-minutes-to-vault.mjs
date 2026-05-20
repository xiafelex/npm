import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadDotEnv } from "./env.mjs";
import {
  defaultVaultRoot,
  meetingBatchSummaryPath,
  meetingRegistryJsonPath,
  meetingRegistryMdPath,
  meetingUiManifestPath,
  meetingUiDocsDir,
  vaultBatchSummaryCopyPath,
  vaultCatalogDir,
  vaultImportRoot,
  vaultManifestCopyPath,
  vaultRawMdDir,
  vaultRegistryCopyPath,
  vaultRegistryMdCopyPath,
  vaultSyncStatePath
} from "./meeting-minutes-paths.mjs";

loadDotEnv();

const vaultRoot = process.env.MEETING_VAULT_ROOT || defaultVaultRoot;
const autoCommit = process.env.MEETING_VAULT_GIT_COMMIT === "1";
const autoPush = process.env.MEETING_VAULT_GIT_PUSH === "1";

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
    return {
      ok: true,
      output: git(args)
    };
  } catch (error) {
    return {
      ok: false,
      error
    };
  }
}

function detectPushTarget() {
  const branch = tryGit(["branch", "--show-current"]);
  const branchName = branch.ok ? branch.output.trim() : "";
  const upstream = tryGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const upstreamRef = upstream.ok ? upstream.output.trim() : "";
  const [remoteName = "origin", upstreamBranchName = ""] = upstreamRef.split("/");

  if (upstreamBranchName === "main") {
    return {
      remoteName,
      branchName,
      targetBranch: "main",
      mode: "head_to_main"
    };
  }

  if (upstreamBranchName && branchName && upstreamBranchName === branchName) {
    return {
      remoteName,
      branchName,
      targetBranch: branchName,
      mode: "head_to_same_name"
    };
  }

  if (branchName) {
    return {
      remoteName,
      branchName,
      targetBranch: branchName,
      mode: "head_to_same_name"
    };
  }

  return {
    remoteName: "origin",
    branchName: "",
    targetBranch: "main",
    mode: "head_to_main"
  };
}

function isMeetingMinute(item) {
  if (item.type !== "FILE" || item.category !== "ALIDOC") return false;
  const text = `${item.name || ""}\n${item.path || ""}`;
  return /会议纪要/i.test(text) && !/章节划分/i.test(text);
}

function main() {
  ensureDir(vaultImportRoot);
  ensureDir(vaultRawMdDir);
  ensureDir(vaultCatalogDir);

  const manifest = readJson(meetingUiManifestPath, { docs: [] });
  const registry = readJson(meetingRegistryJsonPath, { items: [] });
  const previousState = readJson(vaultSyncStatePath, {
    syncedNodeIds: [],
    syncedDocCount: 0,
    lastSyncedAt: null,
    lastCommit: null,
    lastPush: null
  });
  const syncedNodeIds = new Set(previousState.syncedNodeIds || []);
  const copiedDocs = [];

  for (const doc of manifest.docs || []) {
    const relativePath = doc.outputPath || join(meetingUiDocsDir, `${doc.name || doc.nodeId}.md`);
    if (!existsSync(relativePath)) continue;
    const destination = join(vaultRawMdDir, relativePath.split("/").pop());
    copyIfExists(relativePath, destination);
    syncedNodeIds.add(doc.nodeId);
    copiedDocs.push({
      nodeId: doc.nodeId,
      name: doc.name,
      sourceModifiedTime: doc.sourceModifiedTime,
      exportedAt: doc.exportedAt,
      outputPath: destination
    });
  }

  copyIfExists(meetingUiManifestPath, vaultManifestCopyPath);
  copyIfExists(meetingRegistryJsonPath, vaultRegistryCopyPath);
  copyIfExists(meetingRegistryMdPath, vaultRegistryMdCopyPath);
  copyIfExists(meetingBatchSummaryPath, vaultBatchSummaryCopyPath);

  const meetingItems = (registry.items || []).filter(isMeetingMinute);
  const syncedDocCount = meetingItems.filter((item) => item.syncState === "ui_md_current").length;
  const pendingDocCount = meetingItems.filter((item) => item.needsSync !== false).length;

  const nextState = {
    syncedNodeIds: [...syncedNodeIds].sort(),
    syncedDocCount,
    pendingDocCount,
    lastSyncedAt: new Date().toISOString(),
    copiedDocs,
    lastCommit: previousState.lastCommit || null,
    lastPush: previousState.lastPush || null,
    lastCommitError: null,
    lastPushError: null
  };

  if (autoCommit) {
    const addResult = tryGit(["add", "--sparse", "--", "memory/imports/dingtalk/tech_center/monthly_meeting_minutes"]);
    if (!addResult.ok) {
      nextState.lastCommitError = String(addResult.error?.message || addResult.error);
    } else {
      const commitResult = tryGit(["commit", "-m", `Sync monthly meeting minutes (${syncedDocCount} docs)`]);
      nextState.lastCommit = git(["rev-parse", "HEAD"]);
      if (!commitResult.ok) {
        nextState.lastCommitError = String(commitResult.error?.message || commitResult.error);
      }
    }
  }

  if (autoPush) {
    const pushTarget = detectPushTarget();
    const pushArgs = pushTarget.mode === "head_to_main"
      ? ["push", pushTarget.remoteName, "HEAD:main"]
      : ["push", pushTarget.remoteName, "HEAD"];
    const pushResult = tryGit(pushArgs);
    if (pushResult.ok) {
      nextState.lastPush = new Date().toISOString();
    } else {
      nextState.lastPushError = String(pushResult.error?.message || pushResult.error);
      nextState.lastPush = `push_failed:${String(pushResult.error?.message || pushResult.error)}`;
    }
  }

  writeJson(vaultSyncStatePath, nextState);

  const summary = [
    "# Monthly Meeting Minutes Vault Sync",
    "",
    `- syncedDocCount: ${syncedDocCount}`,
    `- pendingDocCount: ${pendingDocCount}`,
    `- lastSyncedAt: ${nextState.lastSyncedAt}`,
    `- lastCommit: ${nextState.lastCommit || ""}`,
    `- lastPush: ${nextState.lastPush || ""}`,
    ""
  ].join("\n");
  writeText(join(vaultCatalogDir, "vault-sync-status.md"), `${summary}\n`);

  console.log(`Vault sync copied ${copiedDocs.length} file(s)`);
  console.log(`Vault syncedDocCount=${syncedDocCount}`);
  console.log(`Vault pendingDocCount=${pendingDocCount}`);
  if (nextState.lastCommit) console.log(`Vault lastCommit=${nextState.lastCommit}`);
  if (nextState.lastCommitError) console.log(`Vault lastCommitError=${nextState.lastCommitError}`);
  if (nextState.lastPush) console.log(`Vault lastPush=${nextState.lastPush}`);
  if (nextState.lastPushError) console.log(`Vault lastPushError=${nextState.lastPushError}`);
}

main();
