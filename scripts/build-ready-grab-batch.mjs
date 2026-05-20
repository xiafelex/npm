import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const reportPath = process.env.READY_BATCH_REPORT_PATH;
const registryPath = process.env.READY_BATCH_REGISTRY_PATH;
const outputPath = process.env.READY_BATCH_OUTPUT_PATH;
const summaryPath = process.env.READY_BATCH_SUMMARY_PATH || "";
const maxItems = Number(process.env.READY_BATCH_MAX_ITEMS || "20");

if (!reportPath || !registryPath || !outputPath) {
  console.error("Set READY_BATCH_REPORT_PATH, READY_BATCH_REGISTRY_PATH, and READY_BATCH_OUTPUT_PATH.");
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

function writeText(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, value);
}

const report = readJson(reportPath);
const registry = readJson(registryPath);
const registryByNodeId = new Map((registry.items || []).map((item) => [item.nodeId, item]));
const readyCandidates = (report.items || [])
  .filter((item) => item.readyToGrab)
  .map((item) => ({ reportItem: item, registryItem: registryByNodeId.get(item.nodeId) }))
  .filter((pair) => pair.registryItem);

const currentCount = readyCandidates.filter((pair) => pair.registryItem.needsSync === false).length;
const pendingCount = readyCandidates.filter((pair) => pair.registryItem.needsSync !== false).length;

const selected = readyCandidates
  .filter((pair) => pair.registryItem.needsSync !== false)
  .slice(0, maxItems)
  .map(({ reportItem: item, registryItem: source }) => {
    return {
      name: source.name,
      nodeId: source.nodeId,
      workspaceId: source.workspaceId,
      path: source.path,
      url: source.url,
      type: source.type,
      category: source.category,
      extension: source.extension,
      modifiedTime: source.modifiedTime,
      createTime: source.createTime,
      syncState: source.syncState,
      preferredMarkdownPath: source.preferredMarkdownPath,
      uiMarkdownPath: source.uiMarkdownPath,
      apiMarkdownPath: source.apiMarkdownPath,
      bodyLineCount: item.bodyLineCount,
      bodyCharacterCount: item.bodyCharacterCount,
      linkLineCount: item.linkLineCount,
      directParent: item.directParent
    };
  });

writeJson(outputPath, selected);

if (summaryPath) {
  const lines = [
    "# Ready Grab Batch",
    "",
    `- report: \`${reportPath}\``,
    `- registry: \`${registryPath}\``,
    `- batch size: ${selected.length}`,
    "",
    "| 顺序 | 标题 | nodeId | 父级 | 字符数 | 链接数 | 修改时间 |",
    "| --- | --- | --- | --- | ---: | ---: | --- |"
  ];
  selected.forEach((item, index) => {
    lines.push(
      `| ${index + 1} | ${String(item.name || "").replace(/\|/g, "\\|")} | ${item.nodeId} | ${String(item.directParent || "").replace(/\|/g, "\\|")} | ${item.bodyCharacterCount || 0} | ${item.linkLineCount || 0} | ${item.modifiedTime || ""} |`
    );
  });
  lines.push("");
  writeText(summaryPath, `${lines.join("\n")}\n`);
}

console.log(`Ready items total: ${readyCandidates.length}`);
console.log(`Ready and already current: ${currentCount}`);
console.log(`Ready and still need sync: ${pendingCount}`);
console.log(`Wrote ${selected.length} ready item(s) to ${outputPath}`);
if (summaryPath) {
  console.log(`Wrote summary to ${summaryPath}`);
}
