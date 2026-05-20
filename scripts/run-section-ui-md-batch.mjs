import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const batchPath = process.env.UI_BATCH_INPUT_PATH;
const uiOutputDir = process.env.UI_BATCH_UI_OUTPUT_DIR;
const uiManifestPath = process.env.UI_BATCH_UI_MANIFEST_PATH;
const sectionTreePath = process.env.UI_BATCH_SECTION_TREE_PATH;
const apiDocsDir = process.env.UI_BATCH_API_DOCS_DIR;
const uiDocsDir = process.env.UI_BATCH_UI_DOCS_DIR;
const registryJsonPath = process.env.UI_BATCH_REGISTRY_JSON_PATH;
const registryMdPath = process.env.UI_BATCH_REGISTRY_MD_PATH;
const analysisPath = process.env.UI_BATCH_ANALYSIS_PATH;
const reportDir = process.env.UI_BATCH_REPORT_DIR;
const reportStem = process.env.UI_BATCH_REPORT_STEM || "CONTENT_SIGNAL_REPORT";
const analyzeRemoteRepo = process.env.UI_BATCH_ANALYZE_REMOTE_GIT_REPO || "";
const analyzeRemotePrefixes = process.env.UI_BATCH_ANALYZE_REMOTE_GIT_PREFIXES || "";
const maxDocs = process.env.UI_BATCH_MAX_DOCS || "20";
const defaultChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function summarizeRegistry(path) {
  const registry = readJson(path);
  const items = registry.items || [];
  const total = items.length;
  const uiCurrent = items.filter((item) => item.syncState === "ui_md_current").length;
  const pending = items.filter((item) => item.needsSync !== false).length;
  return { total, uiCurrent, pending };
}

function summarizeBatch(path) {
  const items = readJson(path);
  return Array.isArray(items) ? items.length : 0;
}

function preferredBrowserExecutablePath() {
  if (process.env.PDF_BROWSER_EXECUTABLE_PATH) return process.env.PDF_BROWSER_EXECUTABLE_PATH;
  if (existsSync(defaultChromePath)) return defaultChromePath;
  return "";
}

for (const required of [
  ["UI_BATCH_INPUT_PATH", batchPath],
  ["UI_BATCH_UI_OUTPUT_DIR", uiOutputDir],
  ["UI_BATCH_UI_MANIFEST_PATH", uiManifestPath],
  ["UI_BATCH_SECTION_TREE_PATH", sectionTreePath],
  ["UI_BATCH_API_DOCS_DIR", apiDocsDir],
  ["UI_BATCH_UI_DOCS_DIR", uiDocsDir],
  ["UI_BATCH_REGISTRY_JSON_PATH", registryJsonPath],
  ["UI_BATCH_REGISTRY_MD_PATH", registryMdPath],
  ["UI_BATCH_ANALYSIS_PATH", analysisPath],
  ["UI_BATCH_REPORT_DIR", reportDir]
]) {
  if (!required[1]) {
    console.error(`Set ${required[0]}.`);
    process.exit(1);
  }
}

function runNode(script, extraEnv) {
  execFileSync("node", [script], {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv }
  });
}

const before = summarizeRegistry(registryJsonPath);
const batchSize = summarizeBatch(batchPath);
const estimatedRoundsLeft = batchSize > 0 ? Math.ceil(before.pending / batchSize) : 0;

console.log(
  `Overall progress before batch: current=${before.uiCurrent}/${before.total}, pending=${before.pending}, this_batch=${batchSize}, est_rounds_left=${estimatedRoundsLeft}`
);

runNode("scripts/export-alidoc-pdfs.mjs", {
  PDF_TARGET_FORMAT: "md",
  PDF_SECTION_TREE_PATH: batchPath,
  PDF_OUTPUT_DIR: uiOutputDir,
  PDF_MANIFEST_PATH: uiManifestPath,
  PDF_MAX_DOCS: maxDocs,
  PDF_CONTINUE_ON_ERROR: process.env.PDF_CONTINUE_ON_ERROR || "1",
  PDF_LOAD_FAILURE_RETRY_LIMIT: process.env.PDF_LOAD_FAILURE_RETRY_LIMIT || "3",
  PDF_OVERALL_TOTAL: String(before.total),
  PDF_OVERALL_DONE_BEFORE: String(before.uiCurrent),
  PDF_OVERALL_PENDING_BEFORE: String(before.pending),
  ...(preferredBrowserExecutablePath() ? { PDF_BROWSER_EXECUTABLE_PATH: preferredBrowserExecutablePath() } : {})
});

runNode("scripts/build-wiki-sync-registry.mjs", {
  SYNC_SECTION_TREE_PATH: sectionTreePath,
  SYNC_API_DOCS_DIR: apiDocsDir,
  SYNC_UI_DOCS_DIR: uiDocsDir,
  SYNC_REGISTRY_JSON_PATH: registryJsonPath,
  SYNC_REGISTRY_MD_PATH: registryMdPath
});

runNode("scripts/analyze-section-sync-status.mjs", {
  ANALYZE_REGISTRY_PATH: registryJsonPath,
  ANALYZE_LOCAL_UI_DIR: uiDocsDir,
  ANALYZE_REMOTE_GIT_REPO: analyzeRemoteRepo,
  ANALYZE_REMOTE_GIT_PREFIXES: analyzeRemotePrefixes,
  ANALYZE_OUTPUT_PATH: analysisPath
});

runNode("scripts/report-section-content-signals.mjs", {
  REPORT_REGISTRY_PATH: registryJsonPath,
  REPORT_OUTPUT_DIR: reportDir,
  REPORT_OUTPUT_STEM: reportStem,
  REPORT_PRINT_LIMIT: process.env.REPORT_PRINT_LIMIT || "80"
});

const after = summarizeRegistry(registryJsonPath);
console.log(
  `Overall progress after batch: current=${after.uiCurrent}/${after.total}, pending=${after.pending}, advanced=${Math.max(0, after.uiCurrent - before.uiCurrent)}`
);
