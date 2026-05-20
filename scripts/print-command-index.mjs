const topic = process.argv[2] ?? "all";

const sections = {
  setup: {
    title: "环境准备",
    commands: [
      "npm install",
      "npx playwright install chromium",
      "cp .env.shared .env",
      "npm run check",
    ],
  },
  management: {
    title: "管理创新",
    commands: [
      "npm run registry:management-innovation",
      "npm run analyze:management-innovation",
      "npm run report:management-innovation",
      "npm run batch:management-innovation:auto",
      "MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto",
    ],
  },
  digital: {
    title: "数字驱动-数据算法研究组",
    commands: [
      "npm run batch:digital-drive-algorithm-group:top20",
      "PDF_LOAD_FAILURE_RETRY_LIMIT=5 npm run sync:digital-drive-algorithm-group:top20:md",
      "npm run analyze:digital-drive-algorithm-group",
      "npm run report:digital-drive-algorithm-group",
      "npm run round:digital-drive-algorithm-group:20",
    ],
  },
  meeting: {
    title: "中心办公-会议纪要",
    commands: [
      "npm run sync:meeting-minutes:all:fast",
      "npm run sync:meeting-minutes:vault:push",
      "npm run sync:meeting-minutes:all:fast:push",
      "npm run status:meeting-minutes",
    ],
  },
  catalog: {
    title: "技术中心总表与板块索引",
    commands: [
      "npm run index:tech-center",
      "npm run analyze:tech-center",
      "npm run report:tech-center",
      "npm run index:center-office",
      "npm run analyze:center-office",
      "npm run report:center-office",
    ],
  },
  lowlevel: {
    title: "通用底层命令",
    commands: [
      "npm run sync:wiki-section",
      "npm run index:wiki-sync",
      "npm run analyze:wiki-sync",
      "npm run report:wiki-content",
      "npm run export:pdf",
    ],
  },
};

const aliases = {
  all: ["setup", "management", "digital", "meeting", "catalog", "lowlevel"],
  mi: ["management"],
  management: ["management"],
  dd: ["digital"],
  digital: ["digital"],
  meeting: ["meeting"],
  center: ["catalog"],
  catalog: ["catalog"],
  setup: ["setup"],
  lowlevel: ["lowlevel"],
};

const selected = aliases[topic];

if (!selected) {
  console.error(`Unknown topic: ${topic}`);
  console.error("Available topics: all, setup, management, digital, meeting, catalog, lowlevel");
  process.exit(1);
}

console.log("DingTalk Runner Command Index");
console.log("");

for (const key of selected) {
  const section = sections[key];
  console.log(`${section.title}`);
  for (const command of section.commands) {
    console.log(`  - ${command}`);
  }
  console.log("");
}

console.log("More detail: docs/COMMAND_INDEX.md");
