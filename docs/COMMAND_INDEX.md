# 命令总表

这个仓库现在的定位是：**命令仓**。  
你不用记住所有脚本名。以后优先按两种维度找：

1. **按动作找**
   - 配置
   - 查询
   - 抓取
   - 回传
2. **按板块找**
   - 管理创新
   - 数字驱动
   - 会议纪要
   - 技术中心总表

状态和结果仍然在 `ai-memory-vault`，这个仓库只负责“怎么跑”。

## 先做环境准备

```bash
npm install
npx playwright install chromium
cp .env.shared .env
npm run check
npm run doctor:sync
```

注意：

- `npm run ...` 默认要求你当前就在这个仓库根目录
- 如果你人在别的目录，比如 `~`，要改用：

```bash
npm --prefix /path/to/npm run doctor:sync
```

建议先设一个环境变量：

```bash
export NPM_CMD_REPO=~/npm
```

这样以后可以在任何目录直接跑：

```bash
npm --prefix "$NPM_CMD_REPO" run doctor:sync
npm --prefix "$NPM_CMD_REPO" run help:query
npm --prefix "$NPM_CMD_REPO" run help:dingtalk-wiki
```

更推荐的长期方案是装全局入口：

```bash
npm install -g github:xiafelex/npm
xnpm locate
xnpm use /path/to/your/npm-repo
xnpm doctor:sync
```

这样以后不管你在哪个目录，都能直接运行：

```bash
xnpm doctor:sync
xnpm help:query
xnpm help:dingtalk-wiki
```

如果你忘了这台电脑把仓库 clone 到哪里，先跑：

```bash
xnpm locate
```

如果受限环境不允许写 `~/.xnpm`，可以先指定：

```bash
export XNPM_CONFIG_DIR=/some/writable/path
```

`doctor:sync` 现在会尽量自动识别三类路径：

- 命令仓
- 执行工作区
- 记忆仓

如果执行工作区没识别出来，可以手动指定：

```bash
export SYNC_WORKSPACE_DIR=/path/to/your/workspace
```

## 最常用入口

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

如果不在仓库目录里，对应写法就是：

```bash
npm --prefix "$NPM_CMD_REPO" run doctor:sync
npm --prefix "$NPM_CMD_REPO" run help:query
npm --prefix "$NPM_CMD_REPO" run help:dingtalk-wiki
```

## 命令和记忆仓的关系

- `npm`
  - 命令仓
  - 放 `npm scripts / Playwright 脚本 / 运行说明`
- `ai-memory-vault`
  - 状态仓
  - 放 `raw-md / sync-registry / manifest / report / runbook`

所以通常顺序是：

1. 在 `ai-memory-vault` 看已有状态
2. 在这个 `npm` 仓先跑 `npm run doctor:sync`
3. 再找并执行命令
4. 再把结果同步回 `ai-memory-vault`

## 管理创新

### 先看待抓状态

```bash
npm run registry:management-innovation
npm run analyze:management-innovation
npm run report:management-innovation
npm run batch:management-innovation:auto
```

### 自动整棵抓取并回传状态仓

```bash
MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto
```

### 前两层专项工作集

```bash
npm run index:management-innovation:front2
npm run analyze:management-innovation:front2
npm run report:management-innovation:front2
npm run batch:management-innovation:top20
npm run sync:management-innovation:top20:md
```

## 数字驱动-数据算法研究组

### 单轮 20 篇

```bash
npm run batch:digital-drive-algorithm-group:top20
PDF_LOAD_FAILURE_RETRY_LIMIT=5 npm run sync:digital-drive-algorithm-group:top20:md
npm run analyze:digital-drive-algorithm-group
npm run report:digital-drive-algorithm-group
```

### 一轮到底

```bash
PDF_LOAD_FAILURE_RETRY_LIMIT=5 npm run round:digital-drive-algorithm-group:20
```

### API / probe 辅助命令

```bash
npm run probe:digital-drive-algorithm-group
npm run sync:digital-drive-algorithm-group:api
```

## 中心办公-会议纪要

### 快速抓取

```bash
npm run sync:meeting-minutes:all:fast
npm run status:meeting-minutes
```

### 抓取后回传状态仓

```bash
npm run sync:meeting-minutes:vault:push
```

### 一步到位

```bash
npm run sync:meeting-minutes:all:fast:push
```

## 技术中心总表 / 板块索引

### 全库总表

```bash
npm run index:tech-center
npm run analyze:tech-center
npm run report:tech-center
```

### 中心办公

```bash
npm run index:center-office
npm run analyze:center-office
npm run report:center-office
```

### 管理创新

```bash
npm run index:management-innovation
npm run registry:management-innovation
npm run analyze:management-innovation
npm run report:management-innovation
```

## 通用底层命令

这些更适合调试或以后扩展新板块时用：

```bash
npm run sync:wiki-section
npm run index:wiki-sync
npm run analyze:wiki-sync
npm run report:wiki-content
npm run export:pdf
```

## 按动作分类

### 1. 配置类

第一次换电脑，先跑这些：

```bash
npm install
npx playwright install chromium
cp .env.shared .env
npm run check
```

### 2. 查询 / 盘点类

想知道“以前怎么跑过、现在还剩多少、哪些已经在记忆仓里”，先跑这些：

```bash
npm run registry:management-innovation
npm run analyze:management-innovation
npm run report:management-innovation
npm run analyze:digital-drive-algorithm-group
npm run report:digital-drive-algorithm-group
npm run status:meeting-minutes
npm run index:tech-center
npm run analyze:tech-center
npm run report:tech-center
```

### 3. 抓取 / 下载类

真正打开 DingTalk 页面、导出 Markdown 的，主要是这些：

```bash
MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto
PDF_LOAD_FAILURE_RETRY_LIMIT=5 npm run sync:digital-drive-algorithm-group:top20:md
PDF_LOAD_FAILURE_RETRY_LIMIT=5 npm run round:digital-drive-algorithm-group:20
npm run sync:meeting-minutes:all:fast
npm run export:pdf
```

### 4. 回传 / 同步类

这些命令会把本地结果同步回 `ai-memory-vault`：

```bash
npm run sync:meeting-minutes:vault:push
npm run sync:meeting-minutes:all:fast:push
MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto
```

## 按来源 + 内容类型分类

### 1. 钉钉 -> 知识库

这里统一覆盖：

- 技术中心总表
- 管理创新
- 数字驱动
- 中心办公

先看这类命令：

```bash
npm run help:dingtalk-wiki
```

### 2. 钉钉 -> 日志 / 日报

这类和知识库不是同一层，先看：

```bash
npm run help:dingtalk-logs
```

当前主要是：

```bash
npm run sync:logs
npm run token:user
```

### 3. 钉钉 -> 会议纪要

这类是专项流，先看：

```bash
npm run help:dingtalk-meeting
```

当前主要是：

```bash
npm run sync:meeting-minutes:all:fast
npm run sync:meeting-minutes:vault:push
npm run status:meeting-minutes
```

## 规则

1. 先看 `help` 或这个文件，再决定跑哪条。
2. 板块级命令优先，不要一上来用底层命令。
3. UI 抓取默认会按 `nodeId + modifiedTime + needsSync` 避免重复。
4. 页面加载失败会自动刷新重试，超过上限就跳过并记日志。
5. 状态仓是 `ai-memory-vault`，这个仓库是执行仓。
6. 如果你先想到“我要查什么”，先看动作分类；如果你先想到“我要跑哪个板块”，再看板块分类。
