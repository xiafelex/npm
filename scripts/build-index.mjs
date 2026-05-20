import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadDotEnv, env } from "./env.mjs";

loadDotEnv();

const dataDir = env("SYNC_OUTPUT_DIR", "data");
const docsDir = env("SYNC_DOCS_DIR", "docs");
mkdirSync(docsDir, { recursive: true });

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const lines = [
  "# 部门知识体系索引",
  "",
  `更新时间: ${new Date().toISOString()}`,
  "",
  "## 钉钉知识库",
  ""
];

const wikiRoot = join(dataDir, "wiki");
if (existsSync(wikiRoot)) {
  for (const entry of readdirSync(wikiRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const treePath = join(wikiRoot, entry.name, "tree.json");
    if (!existsSync(treePath)) continue;
    const nodes = readJson(treePath);
    lines.push(`### ${entry.name}`);
    lines.push("");
    for (const node of nodes) {
      const title = node.title || node.name || node.nodeName || node.nodeId || "未命名节点";
      const url = node.url || node.link || node.webUrl || "";
      lines.push(url ? `- [${title}](${url})` : `- ${title}`);
    }
    lines.push("");
  }
} else {
  lines.push("- 暂无知识库同步数据。", "");
}

lines.push("## 钉钉日志");
lines.push("");

const logsDir = join(docsDir, "logs");
if (existsSync(logsDir)) {
  const files = readdirSync(logsDir).filter((file) => file.endsWith(".md")).sort().reverse();
  for (const file of files) {
    lines.push(`- [${file}](logs/${file})`);
  }
} else {
  lines.push("- 暂无日志归档。");
}

lines.push("");
writeFileSync(join(docsDir, "DEPARTMENT_KNOWLEDGE_INDEX.md"), lines.join("\n"));
console.log(`Index written to ${join(docsDir, "DEPARTMENT_KNOWLEDGE_INDEX.md")}`);
