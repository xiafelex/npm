import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function usage() {
  console.log(`xnpm handoff

Usage:
  npm run handoff -- \
    --device-id macbook-primary \
    --sandbox-id codex-desktop \
    --title "管理创新前两层本轮抓取" \
    --kind evidence \
    --sources "docs/wiki-md/管理创新-前两层,docs/wiki/管理创新-前两层"

Optional:
  --source-command "npm run sync:management-innovation:top20:md"
  --target-layer "memory/imports"
  --target-file "memory/imports/dingtalk/tech_center/management_innovation"
  --workspace "/Users/felex/Documents/Codex/npm"
  --summary-file path/to/summary.md
  --note "extra note"
  --emit-json
`);
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (key === "emit-json") {
      options.emitJson = true;
      continue;
    }
    const value = argv[index + 1];
    if (value == null || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
    index += 1;
  }

  return options;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferTargetLayer(kind) {
  switch (kind) {
    case "conversation":
      return "memory/conversations";
    case "evidence":
      return "memory/imports";
    case "domain-update":
      return "memory/domains";
    case "profile-update":
      return "memory/profiles";
    default:
      return "local-only";
  }
}

function readOptionalText(filePath) {
  if (!filePath) return null;
  try {
    const content = fs.readFileSync(filePath, "utf8").trim();
    return content || null;
  } catch {
    return null;
  }
}

const argv = process.argv.slice(2);

if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
  usage();
  process.exit(0);
}

let options;
try {
  options = parseArgs(argv);
} catch (error) {
  console.error(error.message);
  console.error("");
  usage();
  process.exit(1);
}

const required = ["device-id", "sandbox-id", "title", "kind", "sources"];
const missing = required.filter((key) => !options[key]);
if (missing.length > 0) {
  console.error(`Missing required flags: ${missing.map((key) => `--${key}`).join(", ")}`);
  console.error("");
  usage();
  process.exit(1);
}

const allowedKinds = new Set([
  "conversation",
  "evidence",
  "domain-update",
  "profile-update",
  "local-only",
]);

if (!allowedKinds.has(options.kind)) {
  console.error(`Unsupported kind: ${options.kind}`);
  console.error("Allowed kinds: conversation, evidence, domain-update, profile-update, local-only");
  process.exit(1);
}

const now = new Date();
const createdAt = now.toISOString();
const workspace = options.workspace
  ? path.resolve(options.workspace.replace(/^~(?=$|\/)/, os.homedir()))
  : process.cwd();
const sources = splitList(options.sources);
const outputDir = path.join(process.cwd(), "tmp", "xnpm-handoff");
const slug = slugify(options.title) || `handoff-${now.getTime()}`;
const outputPath = path.join(outputDir, `${slug}.json`);

const manifest = {
  title: options.title,
  device_id: options["device-id"],
  sandbox_id: options["sandbox-id"],
  workspace,
  kind: options.kind,
  source_command: options["source-command"] || null,
  sources,
  target_layer: options["target-layer"] || inferTargetLayer(options.kind),
  target_file: options["target-file"] || null,
  status: "captured",
  created_at: createdAt,
  summary: readOptionalText(options["summary-file"]),
  note: options.note || null,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + "\n");

if (options.emitJson) {
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
  process.exit(0);
}

console.log("xnpm handoff manifest created");
console.log(`- title: ${manifest.title}`);
console.log(`- kind: ${manifest.kind}`);
console.log(`- target_layer: ${manifest.target_layer}`);
if (manifest.target_file) {
  console.log(`- target_file: ${manifest.target_file}`);
}
console.log(`- output: ${outputPath}`);
console.log("");
console.log("Next step in ai-memory-vault:");
console.log(
  `python3 -m src.ai_memory.cli import-handoff-manifest --manifest ${outputPath}`
);
