import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { apiGet } from "./dingtalk-client.mjs";
import { loadDotEnv, env } from "./env.mjs";

loadDotEnv();

const workspaceId = env("DINGTALK_SECTION_WORKSPACE_ID", "xb8bkSMDMLG61aLo");
const rootNodeId = env("DINGTALK_SECTION_ROOT_NODE_ID");
const sectionName = env("DINGTALK_SECTION_NAME", rootNodeId || "section");
const dataDir = env("SYNC_OUTPUT_DIR", "data");
const docsDir = env("SYNC_DOCS_DIR", "docs");
const maxDepth = Number(env("DINGTALK_SECTION_MAX_DEPTH", "3"));
const maxAlidocs = Number(env("DINGTALK_SECTION_MAX_ALIDOCS", "0"));
const sampleSize = Number(env("DINGTALK_SECTION_SAMPLE_SIZE", "0"));
const sampleSeed = env("DINGTALK_SECTION_SAMPLE_SEED", "");
const skipContent = ["1", "true", "yes"].includes(String(env("DINGTALK_SECTION_SKIP_CONTENT", "")).toLowerCase());
const checkpointEvery = Number(env("DINGTALK_SECTION_CHECKPOINT_EVERY", "50"));
const updateRegistry = ["1", "true", "yes"].includes(String(env("DINGTALK_SECTION_UPDATE_REGISTRY", "")).toLowerCase());

if (!rootNodeId) {
  console.error("Set DINGTALK_SECTION_ROOT_NODE_ID.");
  process.exit(1);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function withinDepth(nextDepth) {
  if (!Number.isFinite(maxDepth) || maxDepth <= 0) return true;
  return nextDepth < maxDepth;
}

function safeName(value) {
  return String(value || "untitled")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function writeJson(path, value) {
  ensureDir(path.split("/").slice(0, -1).join("/"));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeOutputs(sectionDataDir, sectionDocsDir, root, nodes, pendingItems, summary) {
  const pendingMarkdown = [
    `# ${sectionName} Pending Items`,
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "## Items",
    "",
    ...pendingItems.map((item) => {
      const link = item.anchorUrl || item.nodeUrl || "";
      const label = item.kind === "unsupported_block" || item.kind === "missing_text_block"
        ? `${item.nodeName} / ${item.blockType} / ${item.blockId}`
        : `${item.nodeName} / ${item.kind} / ${item.category || item.extension || item.error || ""}`;
      return link ? `- [${label}](${link})` : `- ${label}`;
    }),
    ""
  ].join("\n");

  writeJson(join(sectionDataDir, "root.json"), root.node || root);
  writeJson(join(sectionDataDir, "tree.json"), nodes);
  writeJson(join(sectionDataDir, "pending-items.json"), pendingItems);
  writeFileSync(join(sectionDocsDir, "PENDING_ITEMS.md"), pendingMarkdown);
  writeJson(join(sectionDataDir, "sync-summary.json"), summary);
}

function rebuildRegistry(sectionSlug, sectionDataDir, sectionDocsDir) {
  execFileSync("node", ["scripts/build-wiki-sync-registry.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      SYNC_SECTION_TREE_PATH: join(sectionDataDir, "tree.json"),
      SYNC_API_DOCS_DIR: sectionDocsDir,
      SYNC_UI_DOCS_DIR: join(docsDir, "wiki-md", sectionSlug),
      SYNC_REGISTRY_JSON_PATH: join(sectionDataDir, "sync-registry.json"),
      SYNC_REGISTRY_MD_PATH: join(sectionDataDir, "SYNC_REGISTRY.md")
    }
  });
}

function seededRandom(seedText) {
  let seed = 0;
  for (const char of String(seedText || Date.now())) {
    seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  }
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function pickSample(items, size, seedText) {
  if (!size || size <= 0 || items.length <= size) return items;
  const random = seededRandom(seedText);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy.slice(0, size);
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
      lines.push(markdownLineForTextBlock(block, text), "");
    } else if (block.table?.cells?.length) {
      lines.push(tableToMarkdown(block.table), "");
    } else if (block.attachment) {
      const label = attachmentLabel(block);
      const anchorUrl = blockAnchor(sourceUrl, block.id);
      lines.push(anchorUrl ? `[${label}](${anchorUrl})` : label, "");
    } else if (block.id && block.blockType !== "paragraph") {
      const label = isTextListBlock(block)
        ? `Missing DingTalk ${block.blockType} item text: ${block.id}`
        : `Unsupported DingTalk ${block.blockType || "block"}: ${block.id}`;
      const anchorUrl = blockAnchor(sourceUrl, block.id);
      lines.push(anchorUrl ? `[${label}](${anchorUrl})` : `[${label}]`, "");
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
      workspaceId: node.workspaceId || workspaceId
    }));
}

function attachmentItem(node) {
  return {
    kind: "attachment",
    category: node.category || "",
    extension: node.extension || "",
    size: node.size || 0,
    nodeId: node.nodeId || node.id,
    nodeName: node.name || node.title || "",
    nodeUrl: node.url || "",
    workspaceId: node.workspaceId || workspaceId,
    parentNodeId: node.parentNodeId || ""
  };
}

async function listChildren(parentNodeId) {
  const nodes = [];
  let nextToken = "";
  do {
    const body = await apiGet("/v2.0/wiki/nodes", {
      operatorId: env("DINGTALK_OPERATOR_ID"),
      workspaceId,
      parentNodeId,
      nextToken,
      maxResults: 50,
      withPermissionRole: true
    });
    nodes.push(...(body.nodes || body.nodeList || body.list || []));
    nextToken = body.nextToken || "";
  } while (nextToken);
  return nodes;
}

async function readBlocks(nodeId) {
  const body = await apiGet(`/v1.0/doc/suites/documents/${nodeId}/blocks`, {
    operatorId: env("DINGTALK_OPERATOR_ID")
  });
  return body.result?.data || body.data || [];
}

async function main() {
  const sectionSlug = safeName(sectionName);
  const sectionDataDir = join(dataDir, "wiki-sections", sectionSlug);
  const sectionDocsDir = join(docsDir, "wiki", sectionSlug);
  ensureDir(sectionDataDir);
  ensureDir(sectionDocsDir);
  let checkpointCounter = 0;

  const root = await apiGet(`/v2.0/wiki/nodes/${rootNodeId}`, {
    operatorId: env("DINGTALK_OPERATOR_ID"),
    withPermissionRole: true,
    withStatisticalInfo: true
  });

  const nodes = [];
  const pendingItems = [];
  const queue = [{ nodeId: rootNodeId, path: sectionName, depth: 0 }];

  while (queue.length) {
    const parent = queue.shift();
    console.log(`Listing children: ${parent.path}`);
    const children = await listChildren(parent.nodeId);
    for (const child of children) {
      const childId = child.nodeId || child.id;
      const node = {
        ...child,
        parentNodeId: parent.nodeId,
        workspaceId,
        path: `${parent.path}/${child.name || child.title || childId}`
      };
      nodes.push(node);
      checkpointCounter += 1;
      if (checkpointEvery > 0 && checkpointCounter % checkpointEvery === 0) {
        writeOutputs(sectionDataDir, sectionDocsDir, root, nodes, pendingItems, {
          syncedAt: new Date().toISOString(),
          sectionName,
          workspaceId,
          rootNodeId,
          maxDepth,
          skipContent,
          maxAlidocs,
          sampleSize,
          sampleSeed,
          nodeCount: nodes.length,
          alidocCount: 0,
          syncedAlidocCount: 0,
          pendingItemCount: pendingItems.length,
          checkpoint: true
        });
      }
      if (childId && child.hasChildren !== false && withinDepth(parent.depth + 1)) {
        queue.push({ nodeId: childId, path: node.path, depth: parent.depth + 1 });
      }
    }
  }

  const allAlidocs = nodes.filter((node) => node.type === "FILE" && node.category === "ALIDOC");
  const limitedAlidocs = maxAlidocs > 0 ? allAlidocs.slice(0, maxAlidocs) : allAlidocs;
  const alidocs = sampleSize > 0 ? pickSample(limitedAlidocs, sampleSize, sampleSeed) : limitedAlidocs;
  const alidocIds = new Set(alidocs.map((node) => node.nodeId || node.id));
  let alidocIndex = 0;
  for (const node of nodes) {
    const nodeId = node.nodeId || node.id;
    if (node.type === "FILE" && node.category === "ALIDOC" && (!nodeId || !alidocIds.has(nodeId))) {
      continue;
    }
    if (node.type === "FILE" && node.category === "ALIDOC" && nodeId) {
      if (skipContent) {
        pendingItems.push({
          kind: "content_skipped",
          nodeId,
          nodeName: node.name || node.title || "",
          nodeUrl: node.url || "",
          workspaceId,
          category: node.category || "",
          extension: node.extension || ""
        });
        continue;
      }
      try {
        alidocIndex += 1;
        console.log(`Reading ALIDOC ${alidocIndex}/${alidocs.length}: ${node.name || nodeId}`);
        const blocks = await readBlocks(nodeId);
        pendingItems.push(...unsupportedBlocks(blocks, node));
        const title = node.name || node.title || nodeId;
        const content = [
          `# ${title}`,
          "",
          `- nodeId: ${nodeId}`,
          `- path: ${node.path || ""}`,
          `- url: ${node.url || ""}`,
          "",
          blocksToMarkdown(blocks, node.url || "") || "_No readable paragraph content returned._",
          ""
        ].join("\n");
        writeFileSync(join(sectionDocsDir, `${safeName(title)}.md`), content);
      } catch (error) {
        pendingItems.push({
          kind: "read_error",
          nodeId,
          nodeName: node.name || node.title || "",
          nodeUrl: node.url || "",
          workspaceId,
          error: error.message
        });
      }
    } else if (node.type === "FILE") {
      pendingItems.push(attachmentItem(node));
    }
  }

  writeOutputs(sectionDataDir, sectionDocsDir, root, nodes, pendingItems, {
    syncedAt: new Date().toISOString(),
    sectionName,
    workspaceId,
    rootNodeId,
    maxDepth,
    skipContent,
    maxAlidocs,
    sampleSize,
    sampleSeed,
    nodeCount: nodes.length,
    alidocCount: allAlidocs.length,
    syncedAlidocCount: alidocs.length,
    pendingItemCount: pendingItems.length
  });

  if (updateRegistry) {
    rebuildRegistry(sectionSlug, sectionDataDir, sectionDocsDir);
  }

  console.log(`Section sync completed: ${sectionName}`);
  console.log(`Nodes: ${nodes.length}`);
  console.log(`Pending items: ${pendingItems.length}`);
  console.log(`Docs: ${sectionDocsDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
