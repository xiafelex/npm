import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { apiGet } from "./dingtalk-client.mjs";
import { loadDotEnv, env } from "./env.mjs";

loadDotEnv();

const sectionName = env("DINGTALK_AUDIT_SECTION_NAME", "管理创新-前两层");
const dataDir = env("SYNC_OUTPUT_DIR", "data");
const workspaceId = env("DINGTALK_SECTION_WORKSPACE_ID", "xb8bkSMDMLG61aLo");
const sectionDir = join(dataDir, "wiki-sections", sectionName);
const treePath = join(sectionDir, "tree.json");

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
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

function tableTextLength(block) {
  return (block.table?.cells || []).flat().join("").length;
}

function isListBlock(block) {
  return block.blockType === "orderedList" || block.blockType === "unorderedList";
}

async function readBlocks(nodeId) {
  const body = await apiGet(`/v1.0/doc/suites/documents/${nodeId}/blocks`, {
    operatorId: env("DINGTALK_OPERATOR_ID")
  });
  return body.result?.data || body.data || [];
}

async function main() {
  const nodes = JSON.parse(readFileSync(treePath, "utf8"))
    .filter((node) => node.type === "FILE" && node.category === "ALIDOC");
  const docs = [];
  const totals = {
    docs: 0,
    blocks: 0,
    readableTextBlocks: 0,
    readableTextChars: 0,
    tableBlocks: 0,
    tableTextChars: 0,
    missingListItems: 0,
    unsupportedBlocks: 0,
    readErrors: 0
  };

  let index = 0;
  for (const node of nodes) {
    const nodeId = node.nodeId || node.id;
    index += 1;
    console.log(`Auditing ${index}/${nodes.length}: ${node.name || nodeId}`);
    try {
      const blocks = await readBlocks(nodeId);
      const missingListItems = blocks
        .filter((block) => isListBlock(block) && !textFromBlock(block))
        .map((block) => ({
          blockType: block.blockType,
          blockId: block.id,
          index: block.index,
          anchorUrl: blockAnchor(node.url || "", block.id)
        }));
      const readableTextBlocks = blocks.filter((block) => textFromBlock(block));
      const tableBlocks = blocks.filter((block) => block.table?.cells?.length);
      const unsupportedBlocks = blocks.filter((block) =>
        block.id
        && !textFromBlock(block)
        && !block.table?.cells?.length
        && !isListBlock(block)
        && block.blockType !== "paragraph"
      );
      const doc = {
        nodeId,
        name: node.name || node.title || nodeId,
        path: node.path || "",
        url: node.url || "",
        blockCount: blocks.length,
        readableTextBlockCount: readableTextBlocks.length,
        readableTextChars: readableTextBlocks.reduce((sum, block) => sum + textFromBlock(block).length, 0),
        tableBlockCount: tableBlocks.length,
        tableTextChars: tableBlocks.reduce((sum, block) => sum + tableTextLength(block), 0),
        missingListItemCount: missingListItems.length,
        missingListItems,
        unsupportedBlockCount: unsupportedBlocks.length,
        unsupportedBlockTypes: unsupportedBlocks.reduce((acc, block) => {
          const key = block.blockType || "unknown";
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {})
      };
      docs.push(doc);
      totals.docs += 1;
      totals.blocks += doc.blockCount;
      totals.readableTextBlocks += doc.readableTextBlockCount;
      totals.readableTextChars += doc.readableTextChars;
      totals.tableBlocks += doc.tableBlockCount;
      totals.tableTextChars += doc.tableTextChars;
      totals.missingListItems += doc.missingListItemCount;
      totals.unsupportedBlocks += doc.unsupportedBlockCount;
    } catch (error) {
      totals.readErrors += 1;
      docs.push({
        nodeId,
        name: node.name || node.title || nodeId,
        path: node.path || "",
        url: node.url || "",
        error: error.message
      });
    }
  }

  const generatedAt = new Date().toISOString();
  const sortedDocs = [...docs].sort((a, b) =>
    (b.missingListItemCount || 0) - (a.missingListItemCount || 0)
  );
  const markdown = [
    `# ${sectionName} Text Audit`,
    "",
    `Generated at: ${generatedAt}`,
    "",
    "## Totals",
    "",
    `- Docs audited: ${totals.docs}`,
    `- Blocks: ${totals.blocks}`,
    `- Readable text blocks: ${totals.readableTextBlocks}`,
    `- Readable text chars: ${totals.readableTextChars}`,
    `- Table blocks: ${totals.tableBlocks}`,
    `- Table text chars: ${totals.tableTextChars}`,
    `- Missing list items: ${totals.missingListItems}`,
    `- Other unsupported blocks: ${totals.unsupportedBlocks}`,
    `- Read errors: ${totals.readErrors}`,
    "",
    "## Documents With Missing List Items",
    "",
    "| Missing | Document | Path |",
    "| --- | --- | --- |",
    ...sortedDocs
      .filter((doc) => doc.missingListItemCount)
      .map((doc) => `| ${doc.missingListItemCount} | ${doc.url ? `[${doc.name}](${doc.url})` : doc.name} | ${doc.path} |`),
    ""
  ].join("\n");

  ensureDir(sectionDir);
  writeFileSync(join(sectionDir, "text-audit.json"), `${JSON.stringify({
    workspaceId,
    sectionName,
    generatedAt,
    totals,
    docs
  }, null, 2)}\n`);
  writeFileSync(join(sectionDir, "TEXT_AUDIT.md"), markdown);
  console.log(`Wrote ${join(sectionDir, "text-audit.json")}`);
  console.log(`Wrote ${join(sectionDir, "TEXT_AUDIT.md")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
