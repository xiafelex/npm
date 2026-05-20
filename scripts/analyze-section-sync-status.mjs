import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDotEnv, env } from "./env.mjs";

loadDotEnv();

const registryPath = env("ANALYZE_REGISTRY_PATH", "data/wiki-sections/技术中心-全库/sync-registry.json");
const localUiDir = env("ANALYZE_LOCAL_UI_DIR", "");
const remoteRawDirsEnv = env("ANALYZE_REMOTE_RAW_DIRS", env("ANALYZE_REMOTE_RAW_DIR", ""));
const remoteGitRepo = env("ANALYZE_REMOTE_GIT_REPO", "");
const remoteGitPrefixesEnv = env("ANALYZE_REMOTE_GIT_PREFIXES", "");
const outputPath = env("ANALYZE_OUTPUT_PATH", join(dirname(registryPath), "SYNC_ANALYSIS.json"));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function listMarkdownFiles(dir) {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "manifest.json")
    .map((entry) => entry.name);
}

function listMarkdownFilesFromDirs(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((dir) => listMarkdownFiles(dir));
}

function listMarkdownFilesFromGitTree(repo, prefixesValue) {
  if (!repo || !prefixesValue) return [];
  const prefixes = String(prefixesValue)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!prefixes.length) return [];
  try {
    const stdout = execFileSync("git", ["-C", repo, "ls-tree", "-r", "-z", "--name-only", "HEAD", "--", ...prefixes], {
      encoding: "utf8"
    });
    return stdout
      .split("\0")
      .map((line) => line.trim())
      .filter((line) => line.endsWith(".md") && !line.endsWith("/manifest.json"));
  } catch {
    return [];
  }
}

function nodeIdFromFile(name) {
  const match = String(name).match(/__([^./]+)\.md$/);
  return match?.[1] || null;
}

function countBy(items, predicate) {
  return items.filter(predicate).length;
}

function main() {
  const registry = readJson(registryPath);
  const items = registry.items || [];
  const localUiNodeIds = new Set(listMarkdownFiles(localUiDir).map(nodeIdFromFile).filter(Boolean));
  const remoteFiles = listMarkdownFilesFromDirs(remoteRawDirsEnv);
  const remoteGitFiles = listMarkdownFilesFromGitTree(remoteGitRepo, remoteGitPrefixesEnv);
  const remoteNodeIds = new Set([...remoteFiles, ...remoteGitFiles].map(nodeIdFromFile).filter(Boolean));

  const weakStatuses = new Set(["empty_title_only", "attachment_only", "image_only", "link_only", "missing_markdown"]);
  const summary = {
    generatedAt: new Date().toISOString(),
    registryPath,
    totalFiles: items.length,
    localUiDir,
    localUiCount: localUiNodeIds.size,
    remoteRawDirs: String(remoteRawDirsEnv || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
    remoteGitRepo: remoteGitRepo || null,
    remoteGitPrefixes: String(remoteGitPrefixesEnv || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
    remoteSyncedCount: remoteNodeIds.size,
    counts: {
      apiMdOnlyCount: countBy(items, (item) => item.syncState === "api_md_only"),
      pendingCount: countBy(items, (item) => item.syncState === "pending"),
      uiMdCurrentCount: countBy(items, (item) => item.syncState === "ui_md_current"),
      weakContentCount: countBy(items, (item) => weakStatuses.has(item.contentStatus)),
      zeroBodyCount: countBy(items, (item) => item.bodyLineCount === 0),
      linkOnlyCount: countBy(items, (item) => item.contentStatus === "link_only"),
      attachmentOnlyCount: countBy(items, (item) => item.contentStatus === "attachment_only"),
      imageOnlyCount: countBy(items, (item) => item.contentStatus === "image_only"),
      missingMarkdownCount: countBy(items, (item) => item.contentStatus === "missing_markdown")
    },
    localPlan: {
      preparedForLocalGrabCount: countBy(
        items,
        (item) =>
          !localUiNodeIds.has(item.nodeId) &&
          ["api_md_only", "pending"].includes(item.syncState) &&
          !weakStatuses.has(item.contentStatus)
      ),
      needsFurtherGrabCount: countBy(
        items,
        (item) =>
          !localUiNodeIds.has(item.nodeId) &&
          (weakStatuses.has(item.contentStatus) || item.bodyLineCount === 0)
      )
    },
    remotePlan: {
      alreadyInRemoteCount: countBy(items, (item) => remoteNodeIds.has(item.nodeId)),
      notInRemoteCount: countBy(items, (item) => !remoteNodeIds.has(item.nodeId))
    },
    samples: {
      weakContent: items
        .filter((item) => weakStatuses.has(item.contentStatus))
        .slice(0, 30)
        .map((item) => ({
          nodeId: item.nodeId,
          name: item.name,
          path: item.path,
          contentStatus: item.contentStatus,
          bodyLineCount: item.bodyLineCount,
          modifiedTime: item.modifiedTime
        })),
      preparedForLocalGrab: items
        .filter(
          (item) =>
            !localUiNodeIds.has(item.nodeId) &&
            ["api_md_only", "pending"].includes(item.syncState) &&
            !weakStatuses.has(item.contentStatus)
        )
        .slice(0, 30)
        .map((item) => ({
          nodeId: item.nodeId,
          name: item.name,
          path: item.path,
          syncState: item.syncState,
          bodyLineCount: item.bodyLineCount,
          modifiedTime: item.modifiedTime
        }))
    }
  };

  ensureDir(dirname(outputPath));
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main();
