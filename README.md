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
npm run doctor:sync
npm run help
npm run help:config
npm run help:query
npm run help:fetch
npm run help:sync
npm run help:dingtalk-wiki
npm run help:dingtalk-logs
npm run help:dingtalk-meeting
npm run help:management-innovation
npm run help:digital-drive
npm run help:meeting-minutes
npm run help:catalog
```

## 更通用的方式：全局 `xnpm`

如果你经常在 `~` 或别的任意目录里跑命令，推荐直接装一个全局入口：

```bash
npm install -g github:xiafelex/npm
```

第一次只需要登记一次命令仓目录：

```bash
xnpm use /path/to/your/npm-repo
```

例如：

```bash
xnpm use ~/Documents/Codex/npm
```

之后在任何目录都可以直接跑：

```bash
xnpm doctor:sync
xnpm help:dingtalk-wiki
xnpm help:query
```

如果你在某些受限环境里，默认写 `~/.xnpm` 失败，可以先指定：

```bash
export XNPM_CONFIG_DIR=/some/writable/path
```

上面这些命令有一个前提：

- **你当前就在这个仓库根目录里**

如果你不在仓库根目录，比如人在 `~`，请改用：

```bash
npm --prefix /path/to/npm run doctor:sync
```

例如：

```bash
npm --prefix ~/npm run doctor:sync
```

## 环境准备

```bash
npm install
npx playwright install chromium
cp .env.shared .env
npm run check
npm run doctor:sync
```

如果你不想每次先 `cd`，可以先设置：

```bash
export NPM_CMD_REPO=~/npm
```

之后就能在任意目录运行：

```bash
npm --prefix "$NPM_CMD_REPO" run doctor:sync
npm --prefix "$NPM_CMD_REPO" run help:dingtalk-wiki
```

如果你已经用了 `xnpm use ...`，那以后通常不需要再写 `--prefix`。

`npm run doctor:sync` 会帮你快速判断：

- 当前这台电脑正在用哪个命令仓
- 本地有没有找到记忆仓
- 当前分支和远端是谁
- `.env` 关键变量是否齐全
- 本地有没有各板块的台账和抓取状态

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
2. 按来源 + 内容类型：
   - `npm run help:dingtalk-wiki`
   - `npm run help:dingtalk-logs`
   - `npm run help:dingtalk-meeting`
3. 按板块：
   - `npm run help:management-innovation`
   - `npm run help:digital-drive`
   - `npm run help:meeting-minutes`
   - `npm run help:catalog`

## 原则

1. 先在这个仓库找命令，再执行。
2. 先用板块级命令，不要直接从底层脚本起手。
3. 抓取前默认按 `nodeId + modifiedTime + needsSync` 做去重。
4. Git 同步失败不应该浪费已完成下载，后面再补同步。
5. 换电脑或切工作目录后，先跑一次 `npm run doctor:sync`。
