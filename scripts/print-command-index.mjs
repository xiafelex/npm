const topic = process.argv[2] ?? "all";

const sections = {
  setup: {
    title: "环境准备",
    commands: [
      { cmd: "npm install", note: "安装依赖" },
      { cmd: "npx playwright install chromium", note: "安装 Playwright 浏览器" },
      { cmd: "cp .env.shared .env", note: "复制默认环境变量文件" },
      { cmd: "npm run check", note: "检查基础配置是否齐全" },
      { cmd: "npm run doctor:sync", note: "体检这台电脑当前的命令仓/工作区/记忆仓状态" },
    ],
  },
  management: {
    title: "管理创新",
    commands: [
      { cmd: "npm run registry:management-innovation", note: "根据 tree.json 重建管理创新台账" },
      { cmd: "npm run analyze:management-innovation", note: "分析管理创新哪些已经抓过、哪些待同步" },
      { cmd: "npm run report:management-innovation", note: "输出管理创新内容质量报告" },
      { cmd: "npm run batch:management-innovation:auto", note: "生成管理创新下一批待抓文档清单" },
      { cmd: "MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto", note: "自动抓取整棵管理创新并回传记忆仓" },
    ],
  },
  digital: {
    title: "数字驱动-数据算法研究组",
    commands: [
      { cmd: "npm run batch:digital-drive-algorithm-group:top20", note: "生成数字驱动-数据算法研究组下一批 20 篇待抓清单" },
      { cmd: "PDF_LOAD_FAILURE_RETRY_LIMIT=5 npm run sync:digital-drive-algorithm-group:top20:md", note: "抓取这 20 篇的 UI Markdown，失败自动重试" },
      { cmd: "npm run analyze:digital-drive-algorithm-group", note: "分析该工作集的同步状态" },
      { cmd: "npm run report:digital-drive-algorithm-group", note: "输出该工作集的内容信号报告" },
      { cmd: "npm run round:digital-drive-algorithm-group:20", note: "一轮完成：生成 20 篇清单并立刻抓取" },
    ],
  },
  meeting: {
    title: "中心办公-会议纪要",
    commands: [
      { cmd: "npm run sync:meeting-minutes:all:fast", note: "快速抓取会议纪要 Markdown" },
      { cmd: "npm run sync:meeting-minutes:vault:push", note: "把会议纪要结果同步回记忆仓并 push" },
      { cmd: "npm run sync:meeting-minutes:all:fast:push", note: "抓取并立即回传记忆仓" },
      { cmd: "npm run status:meeting-minutes", note: "查看会议纪要当前抓取状态" },
    ],
  },
  catalog: {
    title: "技术中心总表与板块索引",
    commands: [
      { cmd: "npm run index:tech-center", note: "全量遍历技术中心结构树并更新总台账" },
      { cmd: "npm run analyze:tech-center", note: "分析技术中心总表的同步状态" },
      { cmd: "npm run report:tech-center", note: "输出技术中心总表的内容信号报告" },
      { cmd: "npm run index:center-office", note: "遍历中心办公结构并更新台账" },
      { cmd: "npm run analyze:center-office", note: "分析中心办公的同步状态" },
      { cmd: "npm run report:center-office", note: "输出中心办公内容质量报告" },
    ],
  },
  lowlevel: {
    title: "通用底层命令",
    commands: [
      { cmd: "npm run sync:wiki-section", note: "按环境变量指定的板块直接遍历钉钉知识库" },
      { cmd: "npm run index:wiki-sync", note: "根据已有 tree/docs 重建通用 sync-registry" },
      { cmd: "npm run analyze:wiki-sync", note: "分析某个通用板块的同步状态" },
      { cmd: "npm run report:wiki-content", note: "输出某个通用板块的内容信号报告" },
      { cmd: "npm run export:pdf", note: "直接调用 Playwright 导出 Markdown/PDF" },
    ],
  },
  config: {
    title: "配置类命令",
    commands: [
      { cmd: "npm install", note: "安装依赖" },
      { cmd: "npx playwright install chromium", note: "安装 Playwright 浏览器" },
      { cmd: "cp .env.shared .env", note: "复制默认环境变量文件" },
      { cmd: "npm run check", note: "检查基础配置" },
      { cmd: "npm run doctor:sync", note: "体检多电脑同步环境" },
    ],
  },
  query: {
    title: "查询 / 盘点类命令",
    commands: [
      { cmd: "npm run registry:management-innovation", note: "重建管理创新台账，适合先盘点基础结构" },
      { cmd: "npm run analyze:management-innovation", note: "看管理创新哪些 current、哪些 pending" },
      { cmd: "npm run report:management-innovation", note: "看管理创新哪些内容丰富、哪些弱内容" },
      { cmd: "npm run analyze:digital-drive-algorithm-group", note: "看数字驱动-数据算法研究组当前同步状态" },
      { cmd: "npm run report:digital-drive-algorithm-group", note: "看数字驱动-数据算法研究组内容信号" },
      { cmd: "npm run status:meeting-minutes", note: "看会议纪要当前抓取进度" },
      { cmd: "npm run index:tech-center", note: "刷新技术中心总表，用于全局摸底" },
      { cmd: "npm run analyze:tech-center", note: "分析技术中心全库状态" },
      { cmd: "npm run report:tech-center", note: "输出技术中心全库内容报告" },
    ],
  },
  fetch: {
    title: "抓取 / 下载类命令",
    commands: [
      { cmd: "MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto", note: "自动抓整棵管理创新" },
      { cmd: "PDF_LOAD_FAILURE_RETRY_LIMIT=5 npm run sync:digital-drive-algorithm-group:top20:md", note: "抓数字驱动工作集当前批次 20 篇" },
      { cmd: "PDF_LOAD_FAILURE_RETRY_LIMIT=5 npm run round:digital-drive-algorithm-group:20", note: "一轮生成+抓取数字驱动 20 篇" },
      { cmd: "npm run sync:meeting-minutes:all:fast", note: "快速抓会议纪要" },
      { cmd: "npm run export:pdf", note: "低层导出入口，适合调试" },
    ],
  },
  syncback: {
    title: "回传 / 同步到记忆仓",
    commands: [
      { cmd: "npm run sync:meeting-minutes:vault:push", note: "仅回传会议纪要结果到记忆仓" },
      { cmd: "npm run sync:meeting-minutes:all:fast:push", note: "会议纪要抓取完成后立刻回传" },
      { cmd: "MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto", note: "管理创新抓取过程中自动 commit/push 到记忆仓" },
    ],
  },
  dingtalkWiki: {
    title: "钉钉 -> 知识库",
    commands: [
      { cmd: "npm run index:tech-center", note: "刷新技术中心总结构树" },
      { cmd: "npm run analyze:tech-center", note: "分析技术中心全库状态" },
      { cmd: "npm run report:tech-center", note: "看技术中心全库内容质量" },
      { cmd: "npm run index:management-innovation", note: "刷新管理创新整棵结构" },
      { cmd: "npm run registry:management-innovation", note: "重建管理创新台账" },
      { cmd: "npm run analyze:management-innovation", note: "分析管理创新 current/pending" },
      { cmd: "npm run report:management-innovation", note: "输出管理创新内容报告" },
      { cmd: "MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto", note: "自动抓取整棵管理创新" },
      { cmd: "npm run batch:digital-drive-algorithm-group:top20", note: "生成数字驱动工作集下一批 20 篇" },
      { cmd: "PDF_LOAD_FAILURE_RETRY_LIMIT=5 npm run sync:digital-drive-algorithm-group:top20:md", note: "抓这 20 篇 UI Markdown" },
      { cmd: "npm run analyze:digital-drive-algorithm-group", note: "分析数字驱动工作集状态" },
      { cmd: "npm run report:digital-drive-algorithm-group", note: "输出数字驱动工作集内容报告" },
    ],
  },
  dingtalkLogs: {
    title: "钉钉 -> 日志 / 日报",
    commands: [
      { cmd: "npm run sync:logs", note: "拉取钉钉日志 / 日报数据" },
      { cmd: "npm run token:user", note: "获取或检查钉钉用户 token" },
    ],
  },
  dingtalkMeeting: {
    title: "钉钉 -> 会议纪要",
    commands: [
      { cmd: "npm run sync:meeting-minutes:all:fast", note: "快速抓取会议纪要" },
      { cmd: "npm run sync:meeting-minutes:vault:push", note: "把会议纪要同步回记忆仓" },
      { cmd: "npm run sync:meeting-minutes:all:fast:push", note: "抓取并回传会议纪要" },
      { cmd: "npm run status:meeting-minutes", note: "查看会议纪要当前状态" },
    ],
  },
};

const aliases = {
  all: ["setup", "config", "query", "fetch", "syncback", "dingtalkWiki", "dingtalkLogs", "dingtalkMeeting", "management", "digital", "meeting", "catalog", "lowlevel"],
  mi: ["management"],
  management: ["management"],
  dd: ["digital"],
  digital: ["digital"],
  meeting: ["meeting"],
  center: ["catalog"],
  catalog: ["catalog"],
  setup: ["setup"],
  lowlevel: ["lowlevel"],
  config: ["config"],
  query: ["query"],
  fetch: ["fetch"],
  sync: ["syncback"],
  syncback: ["syncback"],
  "dingtalk-wiki": ["dingtalkWiki"],
  "dingtalk-logs": ["dingtalkLogs"],
  "dingtalk-meeting": ["dingtalkMeeting"],
};

const selected = aliases[topic];

if (!selected) {
  console.error(`Unknown topic: ${topic}`);
  console.error("Available topics: all, setup, config, query, fetch, sync, dingtalk-wiki, dingtalk-logs, dingtalk-meeting, management, digital, meeting, catalog, lowlevel");
  process.exit(1);
}

console.log("DingTalk Runner Command Index");
console.log("");

for (const key of selected) {
  const section = sections[key];
  console.log(`${section.title}`);
  for (const command of section.commands) {
    console.log(`  - ${command.cmd}`);
    if (command.note) console.log(`    ${command.note}`);
  }
  console.log("");
}

console.log("More detail: docs/COMMAND_INDEX.md");
