import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const registryPath = process.env.MEETING_REGISTRY_PATH || "data/wiki-sections/中心办公-会议培训-公司职能部门月度汇报/sync-registry.json";
const outputPath = process.env.MEETING_BATCH_OUTPUT_PATH || "data/section-workplans/monthly-meeting-minutes.batch.json";
const summaryPath = process.env.MEETING_BATCH_SUMMARY_PATH || "data/section-workplans/monthly-meeting-minutes.summary.md";
const maxItems = Number(process.env.MEETING_BATCH_MAX_ITEMS || "20");
const includePattern = new RegExp(process.env.MEETING_INCLUDE_PATTERN || "会议纪要", "i");
const excludePattern = new RegExp(process.env.MEETING_EXCLUDE_PATTERN || "章节划分", "i");

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

function compareModifiedDesc(left, right) {
  return String(right.modifiedTime || "").localeCompare(String(left.modifiedTime || ""));
}

function isMeetingMinute(item) {
  const text = `${item.name || ""}\n${item.path || ""}`;
  return includePattern.test(text) && !excludePattern.test(text);
}

function main() {
  const registry = readJson(registryPath);
  const matching = (registry.items || [])
    .filter((item) => item.type === "FILE" && item.category === "ALIDOC")
    .filter(isMeetingMinute)
    .sort(compareModifiedDesc);

  const pending = matching.filter((item) => item.needsSync !== false);
  const current = matching.filter((item) => item.syncState === "ui_md_current");
  const selected = pending.slice(0, maxItems).map((item) => ({
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
    apiMarkdownPath: item.apiMarkdownPath
  }));

  writeJson(outputPath, selected);

  const lines = [
    "# 月度会议纪要同步批次",
    "",
    `- 源 registry：\`${registryPath}\``,
    `- 会议纪要文档总数：${matching.length}`,
    `- 已完成 UI Markdown：${current.length}`,
    `- 待下载：${pending.length}`,
    `- 当前批次大小：${selected.length}`,
    "",
    "| 顺序 | 标题 | nodeId | 修改时间 | syncState | 路径 |",
    "| --- | --- | --- | --- | --- | --- |"
  ];

  selected.forEach((item, index) => {
    lines.push(`| ${index + 1} | ${String(item.name || "").replace(/\|/g, "\\|")} | ${item.nodeId} | ${item.modifiedTime || ""} | ${item.syncState || ""} | ${String(item.path || "").replace(/\|/g, "\\|")} |`);
  });

  lines.push("");
  writeText(summaryPath, `${lines.join("\n")}\n`);
  console.log(`Meeting minutes total: ${matching.length}`);
  console.log(`Meeting minutes current: ${current.length}`);
  console.log(`Meeting minutes pending: ${pending.length}`);
  console.log(`Wrote ${selected.length} meeting-minute item(s) to ${outputPath}`);
}

main();
