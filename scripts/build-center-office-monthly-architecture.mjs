import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  meetingRegistryJsonPath,
  meetingSectionSlug,
  meetingTreePath
} from "./meeting-minutes-paths.mjs";

const outputJsonPath = `data/wiki-sections/${meetingSectionSlug}/ARCHITECTURE_REPORT.json`;
const outputMdPath = `data/wiki-sections/${meetingSectionSlug}/ARCHITECTURE_REPORT.md`;
const rootJsonPath = `data/wiki-sections/${meetingSectionSlug}/root.json`;

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

function parseTime(value) {
  return value ? new Date(value).getTime() : 0;
}

function pickMonthBucket(item) {
  const segments = String(item.path || "").split("/");
  return segments[1] || item.directParent || "未分类";
}

function summarizeDocs(docs) {
  const modifiedTimes = docs
    .map((item) => item.modifiedTime)
    .filter(Boolean)
    .sort();
  const createTimes = docs
    .map((item) => item.createTime)
    .filter(Boolean)
    .sort();

  return {
    docCount: docs.length,
    uiMdCurrentCount: docs.filter((item) => item.syncState === "ui_md_current").length,
    apiMdOnlyCount: docs.filter((item) => item.syncState === "api_md_only").length,
    needsSyncCount: docs.filter((item) => item.needsSync !== false).length,
    emptyTitleOnlyCount: docs.filter((item) => item.contentStatus === "empty_title_only").length,
    attachmentOnlyCount: docs.filter((item) => item.contentStatus === "attachment_only").length,
    latestModifiedTime: modifiedTimes.at(-1) || null,
    earliestModifiedTime: modifiedTimes[0] || null,
    latestCreateTime: createTimes.at(-1) || null,
    earliestCreateTime: createTimes[0] || null
  };
}

function renderTable(rows) {
  const header = [
    "| 月份/目录 | 文档数 | 已抓 UI md | 待抓 | API-only | 空标题 | 附件型 | 最新修改 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |"
  ];
  const body = rows.map((row) =>
    [
      row.bucket,
      row.docCount,
      row.uiMdCurrentCount,
      row.needsSyncCount,
      row.apiMdOnlyCount,
      row.emptyTitleOnlyCount,
      row.attachmentOnlyCount,
      row.latestModifiedTime || ""
    ].join(" | ")
  ).map((line) => `| ${line} |`);
  return [...header, ...body].join("\n");
}

function main() {
  const tree = readJson(meetingTreePath);
  const root = readJson(rootJsonPath);
  const registry = readJson(meetingRegistryJsonPath);
  const items = registry.items || [];
  const docs = items.filter((item) => item.type === "FILE" && item.category === "ALIDOC");
  const treeItems = Array.isArray(tree) ? tree : (tree.items || []);

  const monthMap = new Map();
  for (const doc of docs) {
    const bucket = pickMonthBucket(doc);
    const current = monthMap.get(bucket) || [];
    current.push(doc);
    monthMap.set(bucket, current);
  }

  const monthRows = [...monthMap.entries()]
    .map(([bucket, bucketDocs]) => ({
      bucket,
      ...summarizeDocs(bucketDocs)
    }))
    .sort((a, b) => parseTime(b.latestModifiedTime) - parseTime(a.latestModifiedTime));

  const report = {
    sectionName: meetingSectionSlug,
    workspaceId: root.workspaceId || "xb8bkSMDMLG61aLo",
    rootNodeId: root.nodeId || null,
    nodeCount: treeItems.length,
    alidocCount: docs.length,
    folderCount: treeItems.filter((item) => item.type === "FOLDER" || item.hasChildren).length,
    uiMdCurrentCount: docs.filter((item) => item.syncState === "ui_md_current").length,
    apiMdOnlyCount: docs.filter((item) => item.syncState === "api_md_only").length,
    needsSyncCount: docs.filter((item) => item.needsSync !== false).length,
    generatedAt: new Date().toISOString(),
    monthBuckets: monthRows
  };

  const markdown = [
    "# 中心办公月度汇报架构报告",
    "",
    `- 章节：\`${meetingSectionSlug}\``,
    `- workspaceId：\`${report.workspaceId}\``,
    `- rootNodeId：\`${report.rootNodeId}\``,
    `- 节点总数：${report.nodeCount}`,
    `- 文档总数（ALIDOC）：${report.alidocCount}`,
    `- 文件夹数：${report.folderCount}`,
    `- 已抓 UI Markdown：${report.uiMdCurrentCount}`,
    `- 待抓：${report.needsSyncCount}`,
    `- API-only：${report.apiMdOnlyCount}`,
    `- 生成时间：${report.generatedAt}`,
    "",
    "## 按月份/目录拆解",
    "",
    renderTable(monthRows),
    "",
    "## 说明",
    "",
    "- 这里的“待抓”以 `needsSync !== false` 判定。",
    "- 这里的“API-only”表示目录已建索引，但正文还没完成 UI Markdown 导出。",
    "- 这份报告只针对当前已定位的真实章节树：`中心办公 -> 会议培训 -> 公司职能部门月度汇报`。",
    "- 如果后续继续向上定位更大的 `中心办公` 根节点，可以沿用同样字段扩展。 ",
    ""
  ].join("\n");

  writeJson(outputJsonPath, report);
  writeText(outputMdPath, `${markdown}\n`);

  console.log(`Architecture JSON written to ${outputJsonPath}`);
  console.log(`Architecture Markdown written to ${outputMdPath}`);
}

main();
