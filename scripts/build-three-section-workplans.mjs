import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const registryPath = "data/wiki-sections/管理创新-前两层/sync-registry.json";
const outputDir = "data/section-workplans";
const summaryMdPath = "docs/SECTION_SYNC_WORKPLANS.md";
const blockersPath = "data/section-workplans/export-blockers.json";

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

function loadBlockers() {
  try {
    return readJson(blockersPath);
  } catch {
    return [];
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDate(value) {
  return value ? new Date(value) : null;
}

function compareDesc(a, b) {
  const ta = parseDate(a)?.getTime() || 0;
  const tb = parseDate(b)?.getTime() || 0;
  return tb - ta;
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function classifyChapter(item) {
  const text = `${item.name || ""}\n${item.path || ""}\n${item.directParent || ""}`.toLowerCase();
  const officeKeywords = [
    "中心办公",
    "办公室",
    "办公会",
    "书面发文",
    "人事",
    "人力",
    "行政",
    "资产财务",
    "退休",
    "岗位",
    "劳动合同",
    "用工",
    "福利",
    "档案",
    "工作汇报",
    "工作计划",
    "组织建设",
    "国内统一管理",
    "海外项目驻国内期间管理办法",
    "巴基斯坦分公司策划方案及工作计划"
  ];
  const digitalKeywords = [
    "数字驱动",
    "数字化",
    "数字孪生",
    "代码",
    "数据",
    "ai",
    "人工智能",
    "erp",
    "氚云",
    "sql",
    "docker",
    "nlp",
    "rpa",
    "cursor",
    "github",
    "日报",
    "排产",
    "机器人",
    "idf",
    "pcf"
  ];

  if (
    hasAny(text, digitalKeywords) ||
    ["数字化代码", "数据体系"].includes(item.directParent || "")
  ) {
    return {
      key: "digital-drive",
      label: "数字驱动",
      note: "以数字化工具、代码、数据与 AI 能力建设为主的轨道"
    };
  }

  if (
    hasAny(text, officeKeywords) ||
    ["组织建设", "工作总结与计划"].includes(item.directParent || "")
  ) {
    return {
      key: "center-office",
      label: "中心办公",
      note: "以行政、人事、组织、流程与日常办公管理为主的轨道"
    };
  }

  return {
    key: "management-innovation",
    label: "管理创新",
    note: "以制度、标准、成果、管理方法与综合创新为主的轨道"
  };
}

function actionForItem(item, blockerMap) {
  const blocker = blockerMap.get(item.nodeId);
  if (blocker) {
    return {
      action: blocker.nextAction || "later_blocker_review",
      phase: "Phase 4",
      reason: blocker.reason || "已记录为导出阻塞项，留待专项处理"
    };
  }

  if (item.contentStatus === "empty_title_only") {
    return {
      action: "later_empty_review",
      phase: "Phase 4",
      reason: "仅标题或正文缺失，后置人工复核"
    };
  }

  if (item.contentStatus === "attachment_only") {
    return {
      action: "later_attachment_capture",
      phase: "Phase 4",
      reason: "正文主要为附件提示，后置附件专项"
    };
  }

  if (item.contentStatus === "image_only") {
    return {
      action: "later_visual_capture",
      phase: "Phase 4",
      reason: "正文主要为图片，后置视觉专项"
    };
  }

  if (item.contentStatus === "low_signal_title") {
    return {
      action: "later_low_signal_review",
      phase: "Phase 4",
      reason: "低信号标题，避免混入主同步流"
    };
  }

  if (item.needsSync) {
    return {
      action: "sync_ui_markdown",
      phase: "Phase 2",
      reason: "正文可读且仍需抓取 UI Markdown"
    };
  }

  if (item.syncState === "ui_md_current") {
    return {
      action: "track_incremental_only",
      phase: "Phase 3",
      reason: "已完成同步，后续仅按 modifiedTime 增量追踪"
    };
  }

  if (item.syncState === "ui_md_exported" || item.syncState === "ui_md_file_only") {
    return {
      action: "normalize_or_resync",
      phase: "Phase 3",
      reason: "已抓取但台账仍需归一或重验"
    };
  }

  return {
    action: "api_registry_only",
    phase: "Phase 1",
    reason: "已入目录索引，等待进入正文同步批次"
  };
}

function orderWeight(item, actionInfo) {
  const priorityWeight = Number(item.priorityOrderWeight || 9);
  const actionWeight = {
    sync_ui_markdown: 0,
    normalize_or_resync: 1,
    track_incremental_only: 2,
    api_registry_only: 3,
    later_attachment_capture: 4,
    later_visual_capture: 5,
    later_empty_review: 6,
    later_low_signal_review: 7
  }[actionInfo.action] ?? 9;
  const bodyPenalty = item.contentStatus === "has_body_content" ? 0 : 100;
  return priorityWeight * 1000 + actionWeight * 100 + bodyPenalty;
}

function summarizeChapter(items) {
  return {
    fileCount: items.length,
    pendingCount: items.filter((item) => item.needsSync).length,
    uiMdCurrentCount: items.filter((item) => item.syncState === "ui_md_current").length,
    emptyTitleOnlyCount: items.filter((item) => item.contentStatus === "empty_title_only").length,
    attachmentOnlyCount: items.filter((item) => item.contentStatus === "attachment_only").length,
    p1Count: items.filter((item) => item.priorityTier === "P1").length,
    p2Count: items.filter((item) => item.priorityTier === "P2").length,
    p3Count: items.filter((item) => item.priorityTier === "P3").length
  };
}

function renderTable(items) {
  const header = [
    "| 顺序 | 标题 | nodeId | 修改时间 | 优先级 | 内容状态 | 同步状态 | 建议动作 | 路径 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];

  const rows = items.map((item, index) => [
    index + 1,
    item.name,
    item.nodeId,
    item.modifiedTime || "",
    item.priorityTier,
    item.contentStatus,
    item.syncState,
    item.plannedAction,
    item.path
  ].map((value) => String(value || "").replace(/\|/g, "\\|")));

  return `${header.join("\n")}\n${rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}`;
}

function buildChapterMd(chapter) {
  const lines = [
    `# ${chapter.label}同步工作计划表`,
    "",
    `- 章节属性：${chapter.note}`,
    `- 计划口径：当前基于 \`管理创新-前两层\` 已建台账进行主题拆分，后续若找到独立钉钉章节根节点，再无缝切换到章节级 tree/registry。`,
    `- 文件数：${chapter.stats.fileCount}`,
    `- 待抓取：${chapter.stats.pendingCount}`,
    `- 已同步 UI Markdown：${chapter.stats.uiMdCurrentCount}`,
    `- 空标题：${chapter.stats.emptyTitleOnlyCount}`,
    `- 附件型：${chapter.stats.attachmentOnlyCount}`,
    "",
    "## 执行顺序",
    "",
    "1. `Phase 1` 保持目录与 nodeId / modifiedTime 索引完整",
    "2. `Phase 2` 先抓 `has_body_content + P1/P2` 的正文 Markdown",
    "3. `Phase 3` 对已同步文档只做增量追踪或归一化补修",
    "4. `Phase 4` 最后处理空标题、附件型、图片型与低信号文档",
    "",
    "## 工作计划表",
    "",
    renderTable(chapter.items),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function buildSummaryMd(chapters) {
  const lines = [
    "# 三章节同步工作计划",
    "",
    "这份计划表先基于现有 `管理创新-前两层` 的稳定台账拆出三个工作轨道：`中心办公`、`数字驱动`、`管理创新`。它的作用是先把抓取优先级、文档轨迹和增量规则跑起来；后续一旦定位到独立钉钉章节根节点，可以直接沿用这套字段刷新。",
    "",
    "## 章节概览",
    "",
    "| 章节 | 文件数 | 待抓取 | 已同步 UI Markdown | 空标题 | 附件型 | P1 | P2 | P3 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];

  for (const chapter of chapters) {
    lines.push(
      `| ${chapter.label} | ${chapter.stats.fileCount} | ${chapter.stats.pendingCount} | ${chapter.stats.uiMdCurrentCount} | ${chapter.stats.emptyTitleOnlyCount} | ${chapter.stats.attachmentOnlyCount} | ${chapter.stats.p1Count} | ${chapter.stats.p2Count} | ${chapter.stats.p3Count} |`
    );
  }

  lines.push(
    "",
    "## 计划文件",
    ""
  );

  for (const chapter of chapters) {
    lines.push(
      `- [${chapter.label}计划表](/Users/felex/Documents/Codex/生物柴油模式/排产/公司管理/${chapter.mdPath})`,
      `- [${chapter.label}机读台账](/Users/felex/Documents/Codex/生物柴油模式/排产/公司管理/${chapter.jsonPath})`
    );
  }

  lines.push(
    "",
    "## 统一规则",
    "",
    "- 增量键：`nodeId + modifiedTime + format`",
    "- 主同步流只抓：`contentStatus=has_body_content`",
    "- 后置批次：`empty_title_only / attachment_only / image_only / low_signal_title`",
    "- 每次抓完都要回写：`manifest -> sync-registry -> next-batch`",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function main() {
  const registry = readJson(registryPath);
  const blockers = loadBlockers();
  const blockerMap = new Map(
    blockers
      .filter((item) => item?.nodeId)
      .map((item) => [item.nodeId, item])
  );
  const chapterMap = new Map();

  for (const item of registry.items.filter((entry) => entry.type === "FILE")) {
    const chapterInfo = classifyChapter(item);
    const actionInfo = actionForItem(item, blockerMap);
    const chapterKey = chapterInfo.key;
    const items = chapterMap.get(chapterKey) || [];
    items.push({
      ...item,
      chapterKey,
      chapterLabel: chapterInfo.label,
      chapterNote: chapterInfo.note,
      plannedAction: actionInfo.action,
      plannedPhase: actionInfo.phase,
      plannedReason: actionInfo.reason,
      planOrderWeight: orderWeight(item, actionInfo)
    });
    chapterMap.set(chapterKey, items);
  }

  const chapters = [...chapterMap.entries()]
    .map(([key, items]) => {
      const sample = items[0];
      const sorted = [...items].sort((left, right) => {
        if (left.planOrderWeight !== right.planOrderWeight) return left.planOrderWeight - right.planOrderWeight;
        return compareDesc(left.modifiedTime, right.modifiedTime);
      });
      const withOrder = sorted.map((item, index) => ({
        ...item,
        plannedOrder: index + 1
      }));
      const slug = slugify(key);
      const jsonPath = join(outputDir, `${slug}.workplan.json`);
      const mdPath = join(outputDir, `${slug}.workplan.md`);

      return {
        key,
        label: sample.chapterLabel,
        note: sample.chapterNote,
        stats: summarizeChapter(withOrder),
        items: withOrder,
        jsonPath,
        mdPath
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN"));

  for (const chapter of chapters) {
    writeJson(chapter.jsonPath, {
      chapter: chapter.label,
      note: chapter.note,
      sourceRegistry: registryPath,
      stats: chapter.stats,
      items: chapter.items
    });
    writeText(chapter.mdPath, buildChapterMd(chapter));
  }

  writeText(summaryMdPath, buildSummaryMd(chapters));
}

main();
