import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { loadDotEnv, env } from "./env.mjs";

loadDotEnv();

const sectionTreePath = env("SYNC_SECTION_TREE_PATH", "data/wiki-sections/管理创新-前两层/tree.json");
const sectionSlug = basename(dirname(sectionTreePath));
const uiDocsDir = env("SYNC_UI_DOCS_DIR", join("docs", "wiki-md", sectionSlug));
const uiManifestPath = env("SYNC_UI_MANIFEST_PATH", join(uiDocsDir, "manifest.json"));
const legacyDir = env("SYNC_UI_LEGACY_DIR", join(uiDocsDir, "legacy-indexed"));

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

function listRootMarkdownFiles(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);
}

function main() {
  if (!existsSync(uiDocsDir)) {
    throw new Error(`UI docs directory not found: ${uiDocsDir}`);
  }
  if (!existsSync(uiManifestPath)) {
    throw new Error(`UI manifest not found: ${uiManifestPath}`);
  }
  if (!existsSync(sectionTreePath)) {
    throw new Error(`Section tree not found: ${sectionTreePath}`);
  }

  const tree = readJson(sectionTreePath);
  const docsByNodeId = new Map(tree.filter((item) => item.type === "FILE").map((item) => [item.nodeId, item]));
  const manifest = readJson(uiManifestPath);
  const rootMarkdownFiles = listRootMarkdownFiles(uiDocsDir);
  const normalizedDocs = [];
  const stagedCopies = [];

  ensureDir(legacyDir);

  for (const item of manifest.docs || []) {
    const doc = docsByNodeId.get(item.nodeId);
    if (!doc) continue;
    const currentOutputPath = item.outputPath;
    if (!currentOutputPath || !existsSync(currentOutputPath)) continue;

    const normalizedName = `${outputStem(doc.name, doc.nodeId)}.md`;
    const normalizedPath = join(uiDocsDir, normalizedName);
    const tempPath = join(legacyDir, `normalized-${normalizedName}`);
    copyFileSync(currentOutputPath, tempPath);
    stagedCopies.push({ tempPath, normalizedPath });

    normalizedDocs.push({
      ...item,
      outputPath: normalizedPath
    });
  }

  for (const file of rootMarkdownFiles) {
    const from = join(uiDocsDir, file);
    const to = join(legacyDir, file);
    if (existsSync(to)) rmSync(to);
    renameSync(from, to);
  }

  for (const entry of stagedCopies) {
    renameSync(entry.tempPath, entry.normalizedPath);
  }

  writeJson(uiManifestPath, {
    ...manifest,
    normalizedAt: new Date().toISOString(),
    docs: normalizedDocs.sort((a, b) => String(a.nodeId || "").localeCompare(String(b.nodeId || "")))
  });

  const remainingRootMarkdown = listRootMarkdownFiles(uiDocsDir);
  console.log(
    JSON.stringify(
      {
        uiDocsDir,
        legacyDir,
        archivedCount: rootMarkdownFiles.length,
        normalizedCount: normalizedDocs.length,
        remainingRootMarkdownCount: remainingRootMarkdown.length
      },
      null,
      2
    )
  );
}

main();
