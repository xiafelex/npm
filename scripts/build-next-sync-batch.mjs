import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDotEnv, env } from "./env.mjs";

loadDotEnv();

const registryPath = env("SYNC_REGISTRY_SOURCE_PATH", "data/wiki-sections/管理创新-前两层/sync-registry.json");
const batchPath = env("SYNC_BATCH_OUTPUT_PATH", "data/wiki-sections/管理创新-前两层/next-batch.tree.json");
const batchSize = Number(env("SYNC_BATCH_SIZE", "20"));
const skipStatuses = String(env("SYNC_SKIP_CONTENT_STATUSES", "empty_title_only,attachment_only,image_only,low_signal_title"))
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  if (!existsSync(registryPath)) {
    console.error(`Registry not found: ${registryPath}`);
    process.exit(1);
  }

  const registry = readJson(registryPath);
  const selected = registry.items
    .filter((item) => item.needsSync)
    .filter((item) => !skipStatuses.includes(item.contentStatus))
    .sort((a, b) => {
      if (a.priorityOrderWeight !== b.priorityOrderWeight) return a.priorityOrderWeight - b.priorityOrderWeight;
      return String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || ""));
    })
    .slice(0, batchSize)
    .map((item) => ({
      nodeId: item.nodeId,
      workspaceId: item.workspaceId,
      parentNodeId: item.parentNodeId,
      name: item.name,
      type: item.type,
      category: item.category,
      extension: item.extension,
      url: item.url,
      path: item.path,
      createTime: item.createTime,
      modifiedTime: item.modifiedTime,
      priorityTier: item.priorityTier,
      priorityReason: item.priorityReason,
      suggestedMemoryBucket: item.suggestedMemoryBucket,
      syncState: item.syncState,
      contentStatus: item.contentStatus
    }));

  writeJson(batchPath, selected);
  console.log(`Batch written to ${batchPath}`);
  console.log(`Selected ${selected.length} item(s).`);
}

main();
