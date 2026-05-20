import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { loadDotEnv, env } from "./env.mjs";

loadDotEnv();

const sectionTreePath = env("SYNC_SECTION_TREE_PATH", "data/wiki-sections/管理创新-前两层/tree.json");
const sectionSlug = basename(dirname(sectionTreePath));
const sectionRootLabel = sectionSlug;
const apiDocsDir = env("SYNC_API_DOCS_DIR", join("docs", "wiki", sectionSlug));
const uiDocsDir = env("SYNC_UI_DOCS_DIR", join("docs", "wiki-md", sectionSlug));
const pdfDocsDir = env("SYNC_PDF_DOCS_DIR", join("docs", "wiki-pdf", sectionSlug));
const uiManifestPath = env("SYNC_UI_MANIFEST_PATH", join(uiDocsDir, "manifest.json"));
const pdfManifestPath = env("SYNC_PDF_MANIFEST_PATH", join(pdfDocsDir, "manifest.json"));
const registryJsonPath = env("SYNC_REGISTRY_JSON_PATH", join(dirname(sectionTreePath), "sync-registry.json"));
const registryMdPath = env("SYNC_REGISTRY_MD_PATH", join(dirname(sectionTreePath), "SYNC_REGISTRY.md"));
const previousRegistryPath = registryJsonPath;

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

function safeName(value) {
  return String(value || "untitled")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function outputStem(docName, nodeId) {
  return `${safeName(docName)}__${safeName(nodeId)}`;
}

function listFiles(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

function loadManifest(path) {
  if (!existsSync(path)) return { docs: [] };
  try {
    return readJson(path);
  } catch {
    return { docs: [] };
  }
}

function parseDate(value) {
  return value ? new Date(value) : null;
}

function daysSince(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - parseDate(value).getTime()) / (1000 * 60 * 60 * 24));
}

function pathSegments(node) {
  return String(node.path || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function inferBucket(node) {
  const text = `${node.name || ""}\n${node.path || ""}`.toLowerCase();
  const has = (...keywords) => keywords.some((keyword) => text.includes(keyword.toLowerCase()));

  if (has("组织", "人力", "薪资", "退休", "岗位", "考核", "问卷", "人才")) {
    return {
      bucket: "management/organization-and-talent",
      memoryPath: "memory/domains/management/organization-and-talent/",
      rationale: "组织、人力、岗位或人才相关"
    };
  }
  if (has("研发", "课题", "技术中心", "工程研究中心", "科技型", "研发费用", "企业技术中心")) {
    return {
      bucket: "management/rd-management-and-policy",
      memoryPath: "memory/domains/management/rd-management-and-policy/",
      rationale: "研发管理、资质政策或科研组织相关"
    };
  }
  if (has("申报", "竞赛", "成果", "应用场景", "专项", "评价活动", "论文")) {
    return {
      bucket: "management/innovation-programs-and-achievements",
      memoryPath: "memory/domains/management/innovation-programs-and-achievements/",
      rationale: "成果竞赛、项目申报或论文成果相关"
    };
  }
  if (has("代码", "sql", "python", "erp", "氚云", "oa审批", "docker", "rpa", "日报", "数据组", "maxhub")) {
    return {
      bucket: "engineering/digital-operations-and-tooling",
      memoryPath: "memory/domains/engineering/digital-operations-and-tooling/",
      rationale: "数字化工具、代码或系统操作相关"
    };
  }
  if (has("标准", "规范", "通知", "指引", "办法", "税务", "合同", "资质", "审计")) {
    return {
      bucket: "governance/policy-contract-and-compliance",
      memoryPath: "memory/domains/governance/policy-contract-and-compliance/",
      rationale: "制度、规范、合同或合规政策相关"
    };
  }
  if (has("应用证明", "技术报告", "汇报", "总结", "计划", "实施")) {
    return {
      bucket: "management/operational-reports-and-evidence",
      memoryPath: "memory/domains/management/operational-reports-and-evidence/",
      rationale: "汇报、证据、总结或实施材料相关"
    };
  }
  return {
    bucket: "management/general-reference",
    memoryPath: "memory/domains/management/general-reference/",
    rationale: "通用管理参考资料"
  };
}

function inferPriority(node, bucketInfo) {
  const ageDays = daysSince(node.modifiedTime);
  const text = `${node.name || ""}\n${node.path || ""}`.toLowerCase();
  const hot = ["组织", "管理办法", "工作汇报", "代码", "日报", "申报", "成果", "竞赛", "岗位", "薪资", "技术中心"];
  const isHot = hot.some((keyword) => text.includes(keyword.toLowerCase()));

  if (ageDays <= 120 || isHot) {
    return {
      tier: "P1",
      orderWeight: 1,
      reason: ageDays <= 120 ? "最近 120 天有修改" : `${bucketInfo.bucket} 下的高价值主题`
    };
  }
  if (ageDays <= 365) {
    return {
      tier: "P2",
      orderWeight: 2,
      reason: "近一年有修改，建议第二批同步"
    };
  }
  return {
    tier: "P3",
    orderWeight: 3,
    reason: "较稳定的历史参考资料，可后续补齐"
  };
}

function isLowSignalTitle(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return [
    "无标题文档",
    "无标题文档.adoc",
    "untitled",
    "untitled.adoc"
  ].includes(normalized);
}

function topLevelName(node) {
  const parts = pathSegments(node);
  return parts[1] || parts[0] || "";
}

function syncFingerprint(node, format = "md") {
  return `${node.nodeId || ""}::${node.modifiedTime || ""}::${format}`;
}

function buildManifestMaps(manifest) {
  const byNodeId = new Map();
  for (const item of manifest.docs || []) {
    if (item.nodeId) byNodeId.set(item.nodeId, item);
  }
  return byNodeId;
}

function mdPaths(dir) {
  return listFiles(dir).map((file) => ({
    file,
    path: join(dir, file)
  }));
}

function findMarkdownPath(candidates, docName) {
  const targetSuffix = `${safeName(docName)}.md`;
  const exact = candidates.find((item) => item.file === targetSuffix);
  if (exact) return exact.path;
  const suffixed = candidates.find((item) => item.file.endsWith(`-${targetSuffix}`));
  return suffixed?.path || null;
}

function findMarkdownPathByNode(candidates, docName, nodeId) {
  const stem = outputStem(docName, nodeId);
  const exact = candidates.find((item) => item.file === `${stem}.md`);
  if (exact) return exact.path;
  return findMarkdownPath(candidates, docName);
}

function loadMarkdownAnalysis(path) {
  if (!path || !existsSync(path)) {
    return {
      sourcePath: path,
      heading: "",
      bodyLineCount: 0,
      plainTextLineCount: 0,
      linkLineCount: 0,
      attachmentLineCount: 0,
      imageLineCount: 0,
      bodyCharacterCount: 0,
      contentStatus: "missing_markdown",
      contentBatch: "pending_primary_sync"
    };
  }

  const text = readFileSync(path, "utf8");
  const rawLines = text.split(/\r?\n/);
  const nonEmptyLines = rawLines.map((line) => line.trim()).filter(Boolean);
  const heading = nonEmptyLines[0] || "";
  const bodyLines = nonEmptyLines.filter((line, index) => !(index === 0 && /^#\s+/.test(line)));
  const linkLineCount = bodyLines.filter((line) => /^(\[[^\]]*\]\([^)]+\)|https?:\/\/\S+)$/i.test(line)).length;
  const attachmentLineCount = bodyLines.filter((line) => /请至钉钉文档查看附件/.test(line)).length;
  const imageLineCount = bodyLines.filter((line) => /!\[.*\]\(/.test(line)).length;
  const bodyCharacterCount = bodyLines.join("").length;
  const meaningfulBodyLines = bodyLines.filter((line) => {
    if (/^!\[.*\]\(.+\)$/.test(line)) return false;
    if (/^\[请至钉钉文档查看附件/.test(line)) return false;
    if (/^(\[[^\]]*\]\([^)]+\)|https?:\/\/\S+)$/i.test(line)) return false;
    return true;
  });
  const plainTextLineCount = meaningfulBodyLines.length;

  let contentStatus = "has_body_content";
  let contentBatch = "current_sync_batch";
  if (!bodyLines.length) {
    contentStatus = "empty_title_only";
    contentBatch = "later_empty_review_batch";
  } else if (!meaningfulBodyLines.length && attachmentLineCount > 0) {
    contentStatus = "attachment_only";
    contentBatch = "later_attachment_batch";
  } else if (!meaningfulBodyLines.length && imageLineCount > 0) {
    contentStatus = "image_only";
    contentBatch = "later_visual_review_batch";
  } else if (!meaningfulBodyLines.length && linkLineCount > 0) {
    contentStatus = "link_only";
    contentBatch = "later_link_review_batch";
  }

  return {
    sourcePath: path,
    heading,
    bodyLineCount: bodyLines.length,
    plainTextLineCount,
    linkLineCount,
    attachmentLineCount,
    imageLineCount,
    bodyCharacterCount,
    contentStatus,
    contentBatch
  };
}

function computeSyncState(node, apiPath, uiManifestItem, pdfManifestItem, uiFilePath) {
  if (uiManifestItem && uiManifestItem.sourceModifiedTime && uiManifestItem.sourceModifiedTime === node.modifiedTime) {
    return "ui_md_current";
  }
  if (uiManifestItem) return "ui_md_exported";
  if (uiFilePath) return "ui_md_file_only";
  if (pdfManifestItem) return "pdf_exported";
  if (apiPath) return "api_md_only";
  return "pending";
}

function buildRegistry() {
  const tree = readJson(sectionTreePath);
  const generatedAt = new Date().toISOString();
  const previousRegistry = existsSync(previousRegistryPath) ? readJson(previousRegistryPath) : { items: [] };
  const previousByNodeId = new Map((previousRegistry.items || []).map((item) => [item.nodeId, item]));
  const uiManifest = loadManifest(uiManifestPath);
  const pdfManifest = loadManifest(pdfManifestPath);
  const uiManifestByNodeId = buildManifestMaps(uiManifest);
  const pdfManifestByNodeId = buildManifestMaps(pdfManifest);
  const apiFiles = mdPaths(apiDocsDir);
  const uiFiles = mdPaths(uiDocsDir);

  const files = tree.filter((node) => node.type === "FILE");
  const folders = tree.filter((node) => node.type === "FOLDER");

  const items = files.map((node) => {
    const previousItem = previousByNodeId.get(node.nodeId) || null;
    const apiPath = findMarkdownPathByNode(apiFiles, node.name, node.nodeId) || null;
    const uiFilePath = findMarkdownPathByNode(uiFiles, node.name, node.nodeId) || null;
    const uiManifestItem = uiManifestByNodeId.get(node.nodeId) || null;
    const pdfManifestItem = pdfManifestByNodeId.get(node.nodeId) || null;
    const preferredMarkdownPath = uiManifestItem?.outputPath || uiFilePath || apiPath;
    const markdownAnalysis = loadMarkdownAnalysis(preferredMarkdownPath);
    if (isLowSignalTitle(node.name) && markdownAnalysis.contentStatus === "has_body_content") {
      markdownAnalysis.contentStatus = "low_signal_title";
      markdownAnalysis.contentBatch = "later_title_review_batch";
    }
    const bucketInfo = inferBucket(node);
    const priorityInfo = inferPriority(node, bucketInfo);
    const directParent = topLevelName(node);
    const syncState = computeSyncState(node, apiPath, uiManifestItem, pdfManifestItem, uiFilePath);
    const needsSync = !["ui_md_current", "ui_md_exported", "ui_md_file_only"].includes(syncState);
    return {
      nodeId: node.nodeId,
      workspaceId: node.workspaceId,
      parentNodeId: node.parentNodeId,
      name: node.name,
      type: node.type,
      category: node.category,
      extension: node.extension || "",
      path: node.path,
      url: node.url || null,
      directParent,
      createTime: node.createTime || null,
      modifiedTime: node.modifiedTime || null,
      firstIndexedAt: previousItem?.firstIndexedAt || generatedAt,
      indexedAt: generatedAt,
      existedBefore: Boolean(previousItem),
      previousModifiedTime: previousItem?.modifiedTime || null,
      modifiedChanged: previousItem ? previousItem.modifiedTime !== (node.modifiedTime || null) : true,
      size: node.size || 0,
      apiMarkdownPath: apiPath,
      uiMarkdownPath: uiFilePath,
      uiExportPath: uiManifestItem?.outputPath || null,
      pdfExportPath: pdfManifestItem?.outputPath || null,
      exportDownloadName: uiManifestItem?.exportDownloadName || pdfManifestItem?.exportDownloadName || null,
      exportedAt: uiManifestItem?.exportedAt || pdfManifestItem?.exportedAt || null,
      preferredMarkdownPath,
      syncState,
      syncFingerprintMd: syncFingerprint(node, "md"),
      suggestedFormat: "md",
      suggestedMemoryBucket: bucketInfo.bucket,
      suggestedMemoryPath: bucketInfo.memoryPath,
      categorizationRationale: bucketInfo.rationale,
      priorityTier: priorityInfo.tier,
      priorityReason: priorityInfo.reason,
      priorityOrderWeight: priorityInfo.orderWeight,
      contentStatus: markdownAnalysis.contentStatus,
      contentBatch: markdownAnalysis.contentBatch,
      bodyLineCount: markdownAnalysis.bodyLineCount,
      plainTextLineCount: markdownAnalysis.plainTextLineCount,
      linkLineCount: markdownAnalysis.linkLineCount,
      attachmentLineCount: markdownAnalysis.attachmentLineCount,
      imageLineCount: markdownAnalysis.imageLineCount,
      bodyCharacterCount: markdownAnalysis.bodyCharacterCount,
      needsSync,
      needsReview: ["api_md_only", "pdf_exported", "ui_md_exported"].includes(syncState)
    };
  });

  items.sort((a, b) => {
    if (a.priorityOrderWeight !== b.priorityOrderWeight) return a.priorityOrderWeight - b.priorityOrderWeight;
    return String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || ""));
  });

  const byParent = new Map();
  for (const node of [...folders, ...files]) {
    const label = topLevelName(node) || "(root)";
    const current = byParent.get(label) || { name: label, files: 0, folders: 0, latestModifiedTime: null };
    if (node.type === "FILE") current.files += 1;
    if (node.type === "FOLDER") current.folders += 1;
    if (!current.latestModifiedTime || String(node.modifiedTime || "") > current.latestModifiedTime) {
      current.latestModifiedTime = node.modifiedTime || current.latestModifiedTime;
    }
    byParent.set(label, current);
  }

  const byBucket = new Map();
  for (const item of items) {
    const current = byBucket.get(item.suggestedMemoryBucket) || { bucket: item.suggestedMemoryBucket, count: 0, p1: 0, p2: 0, p3: 0 };
    current.count += 1;
    current[item.priorityTier.toLowerCase()] += 1;
    byBucket.set(item.suggestedMemoryBucket, current);
  }

  return {
    generatedAt,
    sectionTreePath,
    sectionSlug,
    stats: {
      totalNodes: tree.length,
      fileCount: files.length,
      folderCount: folders.length,
      newItemCount: items.filter((item) => !item.existedBefore).length,
      modifiedItemCount: items.filter((item) => item.modifiedChanged).length,
      pendingCount: items.filter((item) => item.needsSync).length,
      uiMdCurrentCount: items.filter((item) => item.syncState === "ui_md_current").length,
      uiMdExportedCount: items.filter((item) => item.syncState === "ui_md_exported").length,
      uiMdFileOnlyCount: items.filter((item) => item.syncState === "ui_md_file_only").length,
      apiMdOnlyCount: items.filter((item) => item.syncState === "api_md_only").length,
      emptyTitleOnlyCount: items.filter((item) => item.contentStatus === "empty_title_only").length,
      attachmentOnlyCount: items.filter((item) => item.contentStatus === "attachment_only").length,
      imageOnlyCount: items.filter((item) => item.contentStatus === "image_only").length,
      linkOnlyCount: items.filter((item) => item.contentStatus === "link_only").length,
      missingMarkdownCount: items.filter((item) => item.contentStatus === "missing_markdown").length,
      zeroBodyCount: items.filter((item) => item.bodyLineCount === 0).length
    },
    directorySummary: [...byParent.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")),
    bucketSummary: [...byBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
    items
  };
}

function markdownTable(rows, headers) {
  const tableRows = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ];
  return tableRows.join("\n");
}

function buildMarkdown(registry) {
  const lines = [
    `# ${sectionRootLabel}同步台账`,
    "",
    `- 生成时间：${registry.generatedAt}`,
    `- sectionTree：\`${registry.sectionTreePath}\``,
    `- 文件数：${registry.stats.fileCount}`,
    `- 文件夹数：${registry.stats.folderCount}`,
    `- 新出现：${registry.stats.newItemCount}`,
    `- 修改过：${registry.stats.modifiedItemCount}`,
    `- 待同步：${registry.stats.pendingCount}`,
    `- UI Markdown 已导出：${registry.stats.uiMdCurrentCount + registry.stats.uiMdExportedCount + registry.stats.uiMdFileOnlyCount}`,
    `- API Markdown 仅同步：${registry.stats.apiMdOnlyCount}`,
    `- 仅标题空文档：${registry.stats.emptyTitleOnlyCount}`,
    `- 仅附件文档：${registry.stats.attachmentOnlyCount}`,
    `- 仅图片文档：${registry.stats.imageOnlyCount}`,
    `- 仅链接文档：${registry.stats.linkOnlyCount}`,
    `- 缺少 Markdown：${registry.stats.missingMarkdownCount}`,
    `- 正文行数为 0：${registry.stats.zeroBodyCount}`,
    "",
    "## 目录架构",
    "",
    markdownTable(
      registry.directorySummary.map((item) => [
        item.name,
        String(item.folders),
        String(item.files),
        item.latestModifiedTime || ""
      ]),
      ["目录", "子文件夹数", "文件数", "最近修改时间"]
    ),
    "",
    "## 记忆分类建议",
    "",
    markdownTable(
      registry.bucketSummary.map((item) => [
        item.bucket,
        String(item.count),
        `${item.p1}/${item.p2}/${item.p3}`
      ]),
      ["建议分类桶", "文件数", "P1/P2/P3"]
    ),
    "",
    "## 优先同步清单（前 30 项）",
    "",
    markdownTable(
      registry.items.slice(0, 30).map((item) => [
        item.priorityTier,
        item.name,
        item.nodeId,
        item.modifiedTime || "",
        item.modifiedChanged ? "changed" : "same",
        item.syncState,
        item.suggestedMemoryBucket
      ]),
      ["优先级", "标题", "nodeId", "修改时间", "是否变更", "当前状态", "建议分类"]
    ),
    "",
    "## 空标题与后续批次",
    "",
    markdownTable(
      registry.items
        .filter((item) => ["empty_title_only", "attachment_only", "image_only", "link_only", "missing_markdown"].includes(item.contentStatus))
        .slice(0, 50)
        .map((item) => [
          item.name,
          item.nodeId,
          item.contentStatus,
          item.contentBatch,
          item.syncState,
          String(item.bodyLineCount)
        ]),
      ["标题", "nodeId", "内容状态", "建议批次", "当前同步状态", "正文行数"]
    ),
    "",
    "## 增量同步规则",
    "",
    "后续建议以 `nodeId + modifiedTime + format` 作为增量指纹：",
    "",
    "- `nodeId`：唯一标识文档",
    "- `modifiedTime`：判断是否有新版本",
    "- `format`：区分 `md` 和 `pdf` 导出产物",
    "",
    "如果同一个 `nodeId` 的 `modifiedTime` 变化了，就把该文档重新加入同步队列。",
    "",
    "## 记录字段建议",
    "",
    "- `nodeId`",
    "- `workspaceId`",
    "- `path`",
    "- `modifiedTime`",
    "- `syncState`",
    "- `suggestedMemoryBucket`",
    "- `outputPath`",
    "- `syncFingerprintMd`",
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function main() {
  if (!existsSync(sectionTreePath)) {
    console.error(`Section tree not found: ${sectionTreePath}`);
    process.exit(1);
  }

  const registry = buildRegistry();
  writeJson(registryJsonPath, registry);
  ensureDir(dirname(registryMdPath));
  writeFileSync(registryMdPath, buildMarkdown(registry));
  console.log(`Registry JSON written to ${registryJsonPath}`);
  console.log(`Registry Markdown written to ${registryMdPath}`);
}

main();
