import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadDotEnv } from "./env.mjs";
import {
  defaultVaultRoot,
  meetingBatchPath,
  meetingRegistryJsonPath,
  meetingRunStatePath,
  meetingUiManifestPath,
  vaultSyncStatePath
} from "./meeting-minutes-paths.mjs";

loadDotEnv();

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function gitOutput(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function isMeetingMinute(item) {
  if (item.type !== "FILE" || item.category !== "ALIDOC") return false;
  const text = `${item.name || ""}\n${item.path || ""}`;
  return /会议纪要/i.test(text) && !/章节划分/i.test(text);
}

function main() {
  const registry = readJson(meetingRegistryJsonPath, { items: [] });
  const manifest = readJson(meetingUiManifestPath, { docs: [] });
  const batch = readJson(meetingBatchPath, []);
  const runState = readJson(meetingRunStatePath, {});
  const vaultState = readJson(vaultSyncStatePath, {});

  const meetingItems = (registry.items || []).filter(isMeetingMinute);
  const current = meetingItems.filter((item) => item.syncState === "ui_md_current").length;
  const pending = meetingItems.filter((item) => item.needsSync !== false).length;
  const vaultRoot = process.env.MEETING_VAULT_ROOT || defaultVaultRoot;
  const vaultBranch = gitOutput(["branch", "--show-current"], vaultRoot);
  const vaultStatus = gitOutput(["status", "--short"], vaultRoot);

  const result = {
    meetingMinutesTotal: meetingItems.length,
    uiMdCurrent: current,
    pending,
    currentBatchSize: batch.length,
    manifestDocs: (manifest.docs || []).length,
    lastRunAt: runState.lastRunAt || null,
    lastRunSummary: runState.lastRunSummary || null,
    vaultLastSyncedAt: vaultState.lastSyncedAt || null,
    vaultSyncedDocCount: vaultState.syncedDocCount || 0,
    vaultLastCommit: vaultState.lastCommit || null,
    vaultLastCommitError: vaultState.lastCommitError || null,
    vaultLastPush: vaultState.lastPush || null,
    vaultLastPushError: vaultState.lastPushError || null,
    vaultBranch,
    vaultWorktreeDirty: Boolean(vaultStatus),
    vaultStatusSample: vaultStatus ? vaultStatus.split("\n").slice(0, 10) : []
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
