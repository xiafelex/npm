# xiafelex/npm

这个仓库现在的定位很简单：

- **它是命令仓**
- 专门放各种要本地执行的 `npm` 命令、Playwright 脚本和运行说明

状态和抓取结果不放这里，状态仓仍然是：

- `ai-memory-vault`

## 你怎么找命令最快

### 1. 先看命令总表

- [docs/COMMAND_INDEX.md](docs/COMMAND_INDEX.md)

### 2. 或者直接在终端里查

```bash
npm run help
npm run help:config
npm run help:query
npm run help:fetch
npm run help:sync
npm run help:management-innovation
npm run help:digital-drive
npm run help:meeting-minutes
npm run help:catalog
```

## 环境准备

```bash
npm install
npx playwright install chromium
cp .env.shared .env
npm run check
```

如果系统 Chrome 不在默认位置，先设置：

```bash
export PDF_BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## 最常用命令

### 管理创新整棵自动抓取

```bash
MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto
```

### 数字驱动-数据算法研究组一轮 20 篇

```bash
npm run batch:digital-drive-algorithm-group:top20
PDF_LOAD_FAILURE_RETRY_LIMIT=5 npm run sync:digital-drive-algorithm-group:top20:md
npm run analyze:digital-drive-algorithm-group
npm run report:digital-drive-algorithm-group
```

### 会议纪要快速抓取

```bash
npm run sync:meeting-minutes:all:fast
npm run status:meeting-minutes
```

## 文档入口

- [docs/COMMAND_INDEX.md](docs/COMMAND_INDEX.md)
- [docs/COMMAND_ARCHITECTURE_DRAFT.md](docs/COMMAND_ARCHITECTURE_DRAFT.md)
- [docs/MANAGEMENT_INNOVATION_MULTI_DEVICE_RUNBOOK.md](docs/MANAGEMENT_INNOVATION_MULTI_DEVICE_RUNBOOK.md)
- [docs/LOCAL_NPM_COMMANDS_MANAGEMENT_INNOVATION.md](docs/LOCAL_NPM_COMMANDS_MANAGEMENT_INNOVATION.md)

## 仓库角色

- `npm`
  - 命令仓
  - 放可执行脚本、命令、环境说明
- `ai-memory-vault`
  - 状态仓
  - 放 `raw-md / sync-registry / report / runbook`

## 怎么分类找命令

以后优先按两条线找：

1. 按动作：
   - `npm run help:config`
   - `npm run help:query`
   - `npm run help:fetch`
   - `npm run help:sync`
2. 按板块：
   - `npm run help:management-innovation`
   - `npm run help:digital-drive`
   - `npm run help:meeting-minutes`
   - `npm run help:catalog`

## 原则

1. 先在这个仓库找命令，再执行。
2. 先用板块级命令，不要直接从底层脚本起手。
3. 抓取前默认按 `nodeId + modifiedTime + needsSync` 做去重。
4. Git 同步失败不应该浪费已完成下载，后面再补同步。
