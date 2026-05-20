import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const registryPath = process.env.MI_BATCH_REGISTRY_PATH;
const reportPath = process.env.MI_BATCH_REPORT_PATH || "";
const outputPath = process.env.MI_BATCH_OUTPUT_PATH;
const summaryPath = process.env.MI_BATCH_SUMMARY_PATH || "";
const maxItems = Number(process.env.MI_BATCH_MAX_ITEMS || "20");

if (!registryPath || !outputPath) {
  console.error("Set MI_BATCH_REGISTRY_PATH and MI_BATCH_OUTPUT_PATH.");
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

function compareHierarchy(a, b) {
  const aParts = String(a.path || "").split("/");
  const bParts = String(b.path || "").split("/");
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const av = aParts[i] || "";
    const bv = bParts[i] || "";
    if (av === bv) continue;
    return av.localeCompare(bv, "zh-Hans-CN");
  }
  return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
}

const registry = readJson(registryPath);
const registryItems = registry.items || registry;
const reportItems = reportPath && existsSync(reportPath) ? readJson(reportPath).items || [] : [];
const reportByNodeId = new Map(reportItems.map((item) => [item.nodeId, item]));

const pendingItems = registryItems
  .filter((item) => item?.category === "ALIDOC")
  .filter((item) => item?.needsSync !== false)
  .sort(compareHierarchy);

const selected = pendingItems.slice(0, maxItems).map((item) => {
  const report = reportByNodeId.get(item.nodeId) || {};
  return {
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
    syncState: item.syncState,
    preferredMarkdownPath: item.preferredMarkdownPath,
    uiMarkdownPath: item.uiMarkdownPath,
    apiMarkdownPath: item.apiMarkdownPath,
    contentStatus: item.contentStatus || report.contentStatus || "",
    bodyLineCount: report.bodyLineCount ?? item.bodyLineCount ?? 0,
    bodyCharacterCount: report.bodyCharacterCount ?? item.bodyCharacterCount ?? 0,
    linkLineCount: report.linkLineCount ?? item.linkLineCount ?? 0,
    directParent: report.directParent || item.directParent || ""
  };
});

writeJson(outputPath, selected);

if (summaryPath) {
  const lines = [
    "# 管理创新待抓批次",
    "",
    `- registry: \`${registryPath}\``,
    reportPath ? `- report: \`${reportPath}\`` : "",
    `- pending total: ${pendingItems.length}`,
    `- batch size: ${selected.length}`,
    "",
    "| 顺序 | 路径 | nodeId | syncState | 正文字数 | 行数 | 更新时间 |",
    "| --- | --- | --- | --- | ---: | ---: | --- |"
  ].filter(Boolean);
  selected.forEach((item, index) => {
    lines.push(
      `| ${index + 1} | ${String(item.path || "").replace(/\|/g, "\\|")} | ${item.nodeId} | ${item.syncState || ""} | ${item.bodyCharacterCount || 0} | ${item.bodyLineCount || 0} | ${item.modifiedTime || ""} |`
    );
  });
  lines.push("");
  writeText(summaryPath, `${lines.join("\n")}\n`);
}

console.log(`Management innovation pending total: ${pendingItems.length}`);
console.log(`Wrote ${selected.length} pending item(s) to ${outputPath}`);
if (summaryPath) {
  console.log(`Wrote summary to ${summaryPath}`);
}
