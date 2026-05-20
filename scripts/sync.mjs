import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { apiGet, oapiPost } from "./dingtalk-client.mjs";
import { loadDotEnv, env, csv } from "./env.mjs";

loadDotEnv();

const mode = process.argv[2] || "all";
const dataDir = env("SYNC_OUTPUT_DIR", "data");
const docsDir = env("SYNC_DOCS_DIR", "docs");

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path, value) {
  ensureDir(path.split("/").slice(0, -1).join("/"));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function arrayFromResponse(body, preferredKeys = []) {
  for (const key of preferredKeys) {
    if (Array.isArray(body?.[key])) return body[key];
    if (body?.[key] && typeof body[key] === "object") return [body[key]];
  }
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.result)) return body.result;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.list)) return body.list;
  if (Array.isArray(body?.items)) return body.items;
  if (body?.workspace) return [body.workspace];
  if (body?.node) return [body.node];
  return [];
}

function safeName(value) {
  return String(value || "untitled")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== "")
  );
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function localDateOnly(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function parseLocalDateStart(value) {
  return new Date(`${value}T00:00:00+08:00`);
}

function parseLocalDateEnd(value) {
  return new Date(`${value}T23:59:59.999+08:00`);
}

function normalizeReportContent(report) {
  const contents = report.contents || report.content || report.form_component_values || [];
  if (!Array.isArray(contents)) return "";
  return contents
    .map((item) => {
      const title = item.title || item.name || item.label || item.key || "内容";
      const value = item.value ?? item.text ?? item.content ?? "";
      return `### ${title}\n\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`;
    })
    .join("\n\n");
}

function blockAnchor(sourceUrl, blockId) {
  return sourceUrl ? `${sourceUrl}?anchorId=X02${blockId}&corpId=` : "";
}

function textFromBlock(block) {
  return block.paragraph?.text
    ?? block.heading?.text
    ?? block.orderedList?.text
    ?? block.unorderedList?.text
    ?? block.todoList?.text
    ?? block.quote?.text
    ?? "";
}

function isTextListBlock(block) {
  return ["orderedList", "unorderedList", "todoList"].includes(block.blockType);
}

function markdownLineForTextBlock(block, text) {
  if (block.blockType === "heading") {
    const level = Number(String(block.heading?.level || "").match(/\d+/)?.[0] || "2");
    return `${"#".repeat(Math.min(Math.max(level, 1), 6))} ${text}`;
  }
  if (block.blockType === "orderedList") return `1. ${text}`;
  if (block.blockType === "unorderedList") return `- ${text}`;
  if (block.blockType === "todoList") return `- [ ] ${text}`;
  return text;
}

function tableToMarkdown(table = {}) {
  const rows = table.cells || [];
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalize = (row) => Array.from({ length: width }, (_, index) =>
    String(row[index] ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>")
  );
  const [firstRow, ...restRows] = rows.map(normalize);
  return [
    `| ${firstRow.join(" | ")} |`,
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...restRows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function attachmentLabel(block) {
  const attachment = block.attachment;
  if (!attachment) return "";
  const details = [
    attachment.name,
    attachment.type,
    attachment.size ? `${attachment.size} bytes` : "",
    attachment.resourceId ? `resourceId: ${attachment.resourceId}` : ""
  ].filter(Boolean);
  return `Attachment: ${details.join(" / ")}`;
}

function blocksToMarkdown(blocks = [], sourceUrl = "") {
  const lines = [];
  for (const block of blocks) {
    const text = textFromBlock(block);
    if (text) {
      lines.push(markdownLineForTextBlock(block, text));
      lines.push("");
    } else if (block.table?.cells?.length) {
      lines.push(tableToMarkdown(block.table));
      lines.push("");
    } else if (block.attachment) {
      const anchorUrl = blockAnchor(sourceUrl, block.id);
      const label = attachmentLabel(block);
      lines.push(anchorUrl ? `[${label}](${anchorUrl})` : label);
      lines.push("");
    } else if (block.id && block.blockType !== "paragraph") {
      const anchorUrl = blockAnchor(sourceUrl, block.id);
      const label = isTextListBlock(block)
        ? `Missing DingTalk ${block.blockType} item text: ${block.id}`
        : `Unsupported DingTalk ${block.blockType || "block"}: ${block.id}`;
      lines.push(anchorUrl ? `[${label}](${anchorUrl})` : `[${label}]`);
      lines.push("");
    }
  }
  return lines.join("\n").trim();
}

function unsupportedBlocks(blocks = [], node) {
  return blocks
    .filter((block) => block.id && block.blockType !== "paragraph" && !textFromBlock(block) && !block.table?.cells?.length)
    .map((block) => ({
      kind: block.attachment ? "attachment_metadata_only" : isTextListBlock(block) ? "missing_text_block" : "unsupported_block",
      blockType: block.blockType || "unknown",
      blockId: block.id,
      attachment: block.attachment || undefined,
      anchorUrl: blockAnchor(node.url || "", block.id),
      nodeId: node.nodeId || node.id,
      nodeName: node.name || node.title || "",
      nodeUrl: node.url || "",
      workspaceId: node.workspaceId || ""
    }));
}

async function listWikiWorkspaces() {
  const operatorId = env("DINGTALK_OPERATOR_ID");
  const workspaces = [];
  let nextToken = "";
  do {
    const body = await apiGet("/v2.0/wiki/workspaces", {
      operatorId,
      nextToken,
      maxResults: 50,
      withPermissionRole: true
    });
    workspaces.push(...arrayFromResponse(body, ["workspaces", "workspaceList", "list", "workspace"]));
    nextToken = body.nextToken || "";
  } while (nextToken);
  return workspaces;
}

async function listWikiChildren(parentNodeId, workspaceId) {
  const operatorId = env("DINGTALK_OPERATOR_ID");
  const nodes = [];
  let nextToken = "";
  do {
    const body = await apiGet("/v2.0/wiki/nodes", {
      operatorId,
      workspaceId,
      parentNodeId,
      nextToken,
      maxResults: 50,
      withPermissionRole: true
    });
    nodes.push(...arrayFromResponse(body, ["nodes", "nodeList", "list", "node"]));
    nextToken = body.nextToken || "";
  } while (nextToken);
  return nodes;
}

async function readAlidocBlocks(nodeId) {
  const body = await apiGet(`/v1.0/doc/suites/documents/${nodeId}/blocks`, {
    operatorId: env("DINGTALK_OPERATOR_ID")
  });
  return body.result?.data || body.data || [];
}

async function readAlidocMarkdown(nodeId, sourceUrl = "") {
  const blocks = await readAlidocBlocks(nodeId);
  return blocksToMarkdown(blocks, sourceUrl);
}

function attachmentItems(nodes) {
  return nodes
    .filter((node) => node.type === "FILE" && node.category !== "ALIDOC")
    .map((node) => ({
      kind: "attachment",
      category: node.category || "",
      extension: node.extension || "",
      size: node.size || 0,
      nodeId: node.nodeId || node.id,
      nodeName: node.name || node.title || "",
      nodeUrl: node.url || "",
      workspaceId: node.workspaceId || "",
      parentNodeId: node.parentNodeId || ""
    }));
}

function writePendingMarkdown(path, pendingItems) {
  const lines = [
    "# DingTalk Pending Items",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "## Summary",
    ""
  ];
  const counts = pendingItems.reduce((acc, item) => {
    const key = item.kind === "unsupported_block" || item.kind === "missing_text_block"
      ? `${item.kind}:${item.blockType}`
      : `${item.kind}:${item.category || item.extension}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  for (const [key, count] of Object.entries(counts).sort()) {
    lines.push(`- ${key}: ${count}`);
  }
  lines.push("", "## Items", "");
  for (const item of pendingItems) {
    const link = item.anchorUrl || item.nodeUrl || "";
    const label = item.kind === "unsupported_block" || item.kind === "missing_text_block"
      ? `${item.nodeName} / ${item.blockType} / ${item.blockId}`
      : `${item.nodeName} / ${item.category || item.extension}`;
    lines.push(link ? `- [${label}](${link})` : `- ${label}`);
  }
  lines.push("");
  writeFileSync(path, lines.join("\n"));
}

async function syncWiki() {
  const configuredWorkspaceIds = csv("DINGTALK_WIKI_WORKSPACE_IDS");
  const visibleWorkspaces = await listWikiWorkspaces();
  const workspaces = configuredWorkspaceIds.length
    ? visibleWorkspaces.filter((workspace) => configuredWorkspaceIds.includes(workspace.workspaceId || workspace.id || workspace.spaceId))
    : visibleWorkspaces;

  ensureDir(join(dataDir, "wiki"));
  const summary = [];
  const allPendingItems = [];

  for (const workspace of workspaces) {
    const workspaceId = workspace.workspaceId || workspace.id || workspace.spaceId;
    if (!workspaceId) continue;

    const workspaceDir = join(dataDir, "wiki", safeName(workspaceId));
    const wikiDocsDir = join(docsDir, "wiki", safeName(workspace.name || workspaceId));
    ensureDir(workspaceDir);
    writeJson(join(workspaceDir, "workspace.json"), workspace);

    const rootNodeId = workspace.rootNodeId || workspace.root_node_id || "0";
    const nodes = [];
    const queue = [{ nodeId: rootNodeId, title: "root" }];

    while (queue.length) {
      const parent = queue.shift();
      const children = await listWikiChildren(parent.nodeId, workspaceId);
      for (const child of children) {
        const node = { ...child, parentNodeId: parent.nodeId, workspaceId };
        nodes.push(node);
        const childId = child.nodeId || child.id;
        if (childId && child.hasChildren !== false) queue.push({ nodeId: childId, title: child.title });
      }
    }

    writeJson(join(workspaceDir, "tree.json"), nodes);
    const pendingItems = attachmentItems(nodes);
    if (env("SYNC_WIKI_CONTENT", "false").toLowerCase() === "true") {
      ensureDir(wikiDocsDir);
      for (const node of nodes) {
        if (node.type !== "FILE" || node.category !== "ALIDOC") continue;
        const nodeId = node.nodeId || node.id;
        if (!nodeId) continue;
        const blocks = await readAlidocBlocks(nodeId);
        pendingItems.push(...unsupportedBlocks(blocks, node));
        const markdown = blocksToMarkdown(blocks, node.url || "");
        const title = node.name || node.title || nodeId;
        const content = [
          `# ${title}`,
          "",
          `- nodeId: ${nodeId}`,
          `- url: ${node.url || ""}`,
          "",
          markdown || "_No readable paragraph content returned._",
          ""
        ].join("\n");
        writeFileSync(join(wikiDocsDir, `${safeName(title)}.md`), content);
      }
    }
    writeJson(join(workspaceDir, "pending-items.json"), pendingItems);
    allPendingItems.push(...pendingItems);
    summary.push({ workspaceId, nodeCount: nodes.length });
  }

  writeJson(join(dataDir, "wiki", "pending-items.json"), allPendingItems);
  writePendingMarkdown(join(docsDir, "DINGTALK_PENDING_ITEMS.md"), allPendingItems);
  writeJson(join(dataDir, "wiki", "sync-summary.json"), {
    syncedAt: new Date().toISOString(),
    workspaces: summary,
    pendingItemCount: allPendingItems.length
  });
  console.log(`Wiki sync completed: ${summary.length} workspace(s).`);
}

async function syncLogs() {
  const userIds = csv("DINGTALK_REPORT_USER_IDS");
  const templateNames = csv("DINGTALK_REPORT_TEMPLATE_NAMES");
  const days = Number(env("SYNC_LOG_DAYS", "14"));
  const configuredStart = env("SYNC_LOG_START_DATE");
  const configuredEnd = env("SYNC_LOG_END_DATE");
  const end = configuredEnd ? parseLocalDateEnd(configuredEnd) : new Date();
  const start = configuredStart ? parseLocalDateStart(configuredStart) : new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const startTime = start.getTime();
  const endTime = end.getTime();
  const allReports = [];
  let cursor = 0;

  ensureDir(join(dataDir, "logs"));
  ensureDir(join(docsDir, "logs"));

  const userScopes = userIds.length ? userIds : [""];
  const templateScopes = templateNames.length ? templateNames : [""];

  for (const userid of userScopes) {
    for (const templateName of templateScopes) {
      cursor = 0;
      do {
        const body = await oapiPost("/topapi/report/list", compactObject({
          start_time: startTime,
          end_time: endTime,
          cursor,
          size: 20,
          userid,
          template_name: templateName
        }));
        const result = body.result || {};
        const reports = arrayFromResponse(result, ["data_list", "list"]);
        allReports.push(...reports);
        cursor = result.next_cursor || 0;
        if (!result.has_more) break;
      } while (cursor);
    }
  }

  const rawPath = join(dataDir, "logs", `${dateOnly(start)}_${dateOnly(end)}.json`);
  writeJson(rawPath, {
    syncedAt: new Date().toISOString(),
    startTime,
    endTime,
    userIds,
    templateNames,
    reports: allReports
  });

  for (const report of allReports) {
    const created = report.create_time ? new Date(report.create_time) : new Date();
    const title = report.template_name || report.report_name || "钉钉日志";
    const reportId = report.report_id || report.id || `${report.create_time || Date.now()}`;
    const fileName = `${localDateOnly(created)}-${safeName(report.creator_id || report.userid || report.creator_name || "unknown")}-${safeName(title)}-${safeName(reportId)}.md`;
    const markdown = [
      `# ${title}`,
      "",
      `- 日期: ${localDateOnly(created)}`,
      `- 用户: ${report.creator_name || report.userid || ""}`,
      `- 模板: ${report.template_name || ""}`,
      `- report_id: ${reportId}`,
      "",
      normalizeReportContent(report),
      "",
      "## 原始数据",
      "",
      "```json",
      JSON.stringify(report, null, 2),
      "```",
      ""
    ].join("\n");
    writeFileSync(join(docsDir, "logs", fileName), markdown);
  }

  console.log(`Log sync completed: ${allReports.length} report(s).`);
}

if (mode === "all" || mode === "wiki") await syncWiki();
if (mode === "all" || mode === "logs") await syncLogs();
