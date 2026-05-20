import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const workplansArg = process.env.WORKPLAN_PATHS || "";
const outputPath = process.env.WORKPLAN_BATCH_OUTPUT_PATH || "data/section-workplans/current-sync-batch.tree.json";
const maxItems = Number(process.env.WORKPLAN_BATCH_MAX_ITEMS || "10");
const blockersPath = process.env.WORKPLAN_BLOCKERS_PATH || "data/section-workplans/export-blockers.json";

if (!workplansArg.trim()) {
  console.error("Set WORKPLAN_PATHS to one or more workplan json paths, separated by commas.");
  process.exit(1);
}

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

function loadBlockers() {
  if (!existsSync(blockersPath)) return new Set();
  const items = readJson(blockersPath);
  return new Set(items.filter((item) => item?.nodeId).map((item) => item.nodeId));
}

function compareItems(left, right) {
  if ((left.planOrderWeight || 0) !== (right.planOrderWeight || 0)) {
    return (left.planOrderWeight || 0) - (right.planOrderWeight || 0);
  }
  return String(left.name || "").localeCompare(String(right.name || ""), "zh-Hans-CN");
}

function main() {
  const paths = workplansArg
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const blockedNodeIds = loadBlockers();
  const items = [];
  for (const path of paths) {
    const workplan = readJson(path);
    for (const item of workplan.items || []) {
      if (item.plannedAction !== "sync_ui_markdown") continue;
      if (blockedNodeIds.has(item.nodeId)) continue;
      items.push({
        name: item.name,
        nodeId: item.nodeId,
        workspaceId: item.workspaceId,
        path: item.path,
        url: item.url,
        type: item.type,
        category: item.category,
        extension: item.extension,
        modifiedTime: item.modifiedTime,
        createTime: item.createTime,
        priorityTier: item.priorityTier,
        chapterLabel: item.chapterLabel,
        plannedAction: item.plannedAction,
        plannedOrder: item.plannedOrder,
        planOrderWeight: item.planOrderWeight
      });
    }
  }

  const selected = items.sort(compareItems).slice(0, maxItems);
  writeJson(outputPath, selected);
  console.log(`Wrote ${selected.length} item(s) to ${outputPath}`);
}

main();
