import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDotEnv, env } from "./env.mjs";

loadDotEnv();

const registryPath = env("REPORT_REGISTRY_PATH", "data/wiki-sections/技术中心-全库/sync-registry.json");
const outputDir = env("REPORT_OUTPUT_DIR", dirname(registryPath));
const outputStem = env("REPORT_OUTPUT_STEM", "CONTENT_SIGNAL_REPORT");
const printAll = env("REPORT_PRINT_ALL", "0") === "1";
const printLimit = Number(env("REPORT_PRINT_LIMIT", "50"));
const minReadyChars = Number(env("REPORT_MIN_READY_CHARS", "20"));
const minReadyLines = Number(env("REPORT_MIN_READY_LINES", "3"));

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function markdownTable(rows, headers) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function lowSignalTitle(name) {
  return /^无标题文档(?:\.adoc)?$/i.test(String(name || "").trim());
}

function weakContent(item) {
  return ["empty_title_only", "attachment_only", "image_only", "link_only", "missing_markdown"].includes(item.contentStatus);
}

function onlyOneLink(item) {
  return item.linkLineCount === 1 && item.bodyCharacterCount <= 120 && item.plainTextLineCount === 0;
}

function onlyTitleLike(item) {
  return item.bodyLineCount === 0 || item.contentStatus === "empty_title_only";
}

function readyToGrab(item) {
  return (
    item.syncState === "api_md_only" &&
    !weakContent(item) &&
    !lowSignalTitle(item.name) &&
    item.bodyCharacterCount >= minReadyChars &&
    item.bodyLineCount >= minReadyLines
  );
}

function main() {
  if (!existsSync(registryPath)) {
    console.error(`Registry not found: ${registryPath}`);
    process.exit(1);
  }

  const registry = readJson(registryPath);
  const items = registry.items || [];
  const generatedAt = new Date().toISOString();

  const annotated = items.map((item) => ({
    nodeId: item.nodeId,
    name: item.name,
    path: item.path,
    directParent: item.directParent,
    syncState: item.syncState,
    contentStatus: item.contentStatus,
    modifiedTime: item.modifiedTime || "",
    bodyLineCount: item.bodyLineCount || 0,
    plainTextLineCount: item.plainTextLineCount || 0,
    bodyCharacterCount: item.bodyCharacterCount || 0,
    linkLineCount: item.linkLineCount || 0,
    attachmentLineCount: item.attachmentLineCount || 0,
    imageLineCount: item.imageLineCount || 0,
    onlyTitleLike: onlyTitleLike(item),
    onlyOneLink: onlyOneLink(item),
    lowSignalTitle: lowSignalTitle(item.name),
    readyToGrab: readyToGrab(item)
  }));

  const summary = {
    generatedAt,
    registryPath,
    totalFiles: annotated.length,
    readyToGrabCount: annotated.filter((item) => item.readyToGrab).length,
    onlyTitleLikeCount: annotated.filter((item) => item.onlyTitleLike).length,
    onlyOneLinkCount: annotated.filter((item) => item.onlyOneLink).length,
    weakContentCount: annotated.filter((item) => weakContent(item)).length,
    apiMdOnlyCount: annotated.filter((item) => item.syncState === "api_md_only").length,
    pendingCount: annotated.filter((item) => item.syncState === "pending").length,
    lowSignalTitleCount: annotated.filter((item) => item.lowSignalTitle).length
  };

  const rows = annotated
    .slice()
    .sort((a, b) => {
      if (Number(b.readyToGrab) !== Number(a.readyToGrab)) return Number(b.readyToGrab) - Number(a.readyToGrab);
      if (b.bodyCharacterCount !== a.bodyCharacterCount) return b.bodyCharacterCount - a.bodyCharacterCount;
      return String(b.modifiedTime).localeCompare(String(a.modifiedTime));
    });

  ensureDir(outputDir);
  const jsonPath = join(outputDir, `${outputStem}.json`);
  const csvPath = join(outputDir, `${outputStem}.csv`);
  const mdPath = join(outputDir, `${outputStem}.md`);

  writeFileSync(jsonPath, `${JSON.stringify({ summary, items: rows }, null, 2)}\n`);
  writeFileSync(
    csvPath,
    [
      [
        "nodeId",
        "name",
        "directParent",
        "syncState",
        "contentStatus",
        "bodyLineCount",
        "plainTextLineCount",
        "bodyCharacterCount",
        "linkLineCount",
        "attachmentLineCount",
        "imageLineCount",
        "onlyTitleLike",
        "onlyOneLink",
        "lowSignalTitle",
        "readyToGrab",
        "modifiedTime",
        "path"
      ].join(","),
      ...rows.map((item) =>
        [
          item.nodeId,
          item.name,
          item.directParent,
          item.syncState,
          item.contentStatus,
          item.bodyLineCount,
          item.plainTextLineCount,
          item.bodyCharacterCount,
          item.linkLineCount,
          item.attachmentLineCount,
          item.imageLineCount,
          item.onlyTitleLike,
          item.onlyOneLink,
          item.lowSignalTitle,
          item.readyToGrab,
          item.modifiedTime,
          item.path
        ]
          .map(csvEscape)
          .join(",")
      )
    ].join("\n") + "\n"
  );

  const mdLines = [
    `# 内容体检报告`,
    "",
    `- 生成时间：${generatedAt}`,
    `- registry：\`${registryPath}\``,
    `- 总文件：${summary.totalFiles}`,
    `- 可优先抓取：${summary.readyToGrabCount}`,
    `- 仅标题/无正文：${summary.onlyTitleLikeCount}`,
    `- 仅一个链接：${summary.onlyOneLinkCount}`,
    `- 弱内容总数：${summary.weakContentCount}`,
    `- API md：${summary.apiMdOnlyCount}`,
    `- pending：${summary.pendingCount}`,
    `- 低信号标题：${summary.lowSignalTitleCount}`,
    "",
    "## 优先抓取样本",
    "",
    markdownTable(
      rows
        .filter((item) => item.readyToGrab)
        .slice(0, 50)
        .map((item) => [
          item.name,
          item.nodeId,
          String(item.bodyCharacterCount),
          String(item.linkLineCount),
          item.modifiedTime,
          item.path
        ]),
      ["标题", "nodeId", "正文字符数", "链接数", "修改时间", "路径"]
    ),
    "",
    "## 弱内容样本",
    "",
    markdownTable(
      rows
        .filter((item) => item.onlyTitleLike || item.onlyOneLink || weakContent(item))
        .slice(0, 50)
        .map((item) => [
          item.name,
          item.nodeId,
          item.contentStatus,
          String(item.bodyCharacterCount),
          String(item.linkLineCount),
          item.path
        ]),
      ["标题", "nodeId", "内容状态", "正文字符数", "链接数", "路径"]
    ),
    ""
  ];
  writeFileSync(mdPath, mdLines.join("\n"));

  console.log(`Section report: ${registryPath}`);
  console.log(`Total files: ${summary.totalFiles}`);
  console.log(`Ready to grab: ${summary.readyToGrabCount}`);
  console.log(`Only title / no body: ${summary.onlyTitleLikeCount}`);
  console.log(`Only one link: ${summary.onlyOneLinkCount}`);
  console.log(`Weak content total: ${summary.weakContentCount}`);
  console.log(`API md only: ${summary.apiMdOnlyCount}`);
  console.log(`Pending: ${summary.pendingCount}`);
  console.log(`Low-signal titles: ${summary.lowSignalTitleCount}`);
  console.log(`Wrote: ${jsonPath}`);
  console.log(`Wrote: ${csvPath}`);
  console.log(`Wrote: ${mdPath}`);

  const terminalRows = printAll ? rows : rows.slice(0, printLimit);
  console.log("");
  console.log("Top rows:");
  for (const item of terminalRows) {
    console.log(
      [
        item.readyToGrab ? "[READY]" : "[CHECK]",
        item.directParent || "",
        item.name,
        `chars=${item.bodyCharacterCount}`,
        `lines=${item.bodyLineCount}`,
        `links=${item.linkLineCount}`,
        `status=${item.contentStatus}`,
        `sync=${item.syncState}`
      ].join(" | ")
    );
  }
}

main();
