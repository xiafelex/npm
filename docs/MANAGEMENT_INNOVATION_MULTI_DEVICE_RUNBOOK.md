# 管理创新知识库多电脑续跑 Runbook

## 目标

这份说明面向“另一台电脑接手继续抓取管理创新知识库”的场景。

核心原则：

1. 本地项目仓库负责执行脚本和抓取。
2. `ai-memory-vault` 负责保存状态、原始 Markdown、方法说明。
3. 抓取前先比对 `nodeId + modifiedTime + syncState`，只抓还没抓到当前版本的文档。
4. Git 同步失败时，不中断后续抓取；等抓取批次完成后再补同步。

## 两个仓库的职责

### 1. 当前项目仓库 / 执行仓

职责：

- `npm run ...`
- Playwright 打开钉钉文档并导出 Markdown
- 更新本地：
  - `docs/wiki-md/...`
  - `data/wiki-sections/...`

另一台电脑不需要复用你这台机器的本地目录名。

只要进入执行仓根目录即可。例如在执行分支里：

```bash
cd tooling/dingtalk-sync-runner
```

### 2. 记忆库仓库

路径：

- `/Users/felex/Documents/Codex/ai-memory-vault-local`

远端：

- [xiafelex/ai-memory-vault](https://github.com/xiafelex/ai-memory-vault)

职责：

- 保存已经抓下来的 `raw-md`
- 保存 `sync-registry / manifest / analysis / report`
- 保存命令说明和脚本快照，供另一台电脑对照

## 环境准备

### Node

- Node `>=20`

### 依赖安装

在项目仓库里执行：

```bash
cd tooling/dingtalk-sync-runner
npm install
```

### Playwright 浏览器

当前脚本优先使用系统 Chrome，但仍建议把 Playwright 浏览器也装上：

```bash
npx playwright install chromium
```

### 系统 Chrome

默认使用：

```text
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

如果另一台电脑 Chrome 不在这个位置，需要在运行前设置：

```bash
export PDF_BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## 先看远端状态

另一台电脑开始前，先 `git pull` 记忆库，然后优先看：

- `memory/imports/dingtalk/tech_center/management_innovation/catalog/`
- `memory/imports/dingtalk/tech_center/management_innovation/raw-md/`
- `memory/imports/dingtalk/tech_center/notes/TECH_CENTER_SYNC_RUNBOOK.md`
- `memory/imports/dingtalk/tech_center/management_innovation/notes/LOCAL_NPM_COMMANDS.md`

这些文件回答：

- 哪些已经抓过
- 哪些已经上传
- 当前还剩什么要抓

## 管理创新有两套工作集

### 1. 管理创新-前两层

这是早期已经跑通的一条稳定工作集。

对应本地目录：

- `data/wiki-sections/管理创新-前两层/`
- `docs/wiki-md/管理创新-前两层/`

特点：

- 适合跨电脑续跑
- 文档量小
- 状态比较稳定

### 2. 整棵管理创新

这是全量遍历工作集。

对应本地目录：

- `data/wiki-sections/管理创新/`
- `docs/wiki-md/管理创新/`

特点：

- 覆盖所有子层级
- 抓取前会先建完整 `sync-registry`
- 适合作为新的主工作流

## 全量管理创新推荐命令

### 一条命令自动执行

```bash
cd tooling/dingtalk-sync-runner
MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto
```

这条命令会自动：

1. 遍历整棵 `管理创新`
2. 建立/更新：
   - `tree.json`
   - `sync-registry.json`
   - `SYNC_ANALYSIS.json`
   - `CONTENT_SIGNAL_REPORT.json`
3. 按层级顺序筛选待抓文档
4. 每轮抓 `20` 篇
5. 每轮后同步到 `ai-memory-vault-local`
6. 尝试 commit / push 到 GitHub

### 只预览，不抓取

```bash
cd tooling/dingtalk-sync-runner
npm run registry:management-innovation
npm run analyze:management-innovation
npm run report:management-innovation
npm run batch:management-innovation:auto
```

这组命令会生成：

- `data/wiki-sections/管理创新/TOP20_READY.json`
- `data/wiki-sections/管理创新/TOP20_READY.md`

## 当前判断逻辑

是否需要抓，主要看：

1. `nodeId`
2. `modifiedTime`
3. `syncState`
4. `needsSync`

简化理解：

- `ui_md_current`
  - 本地 UI Markdown 已经是当前版本
  - 不再重复抓
- `api_md_only`
  - 已有 API 版 Markdown
  - 如果 `needsSync=true`，就仍然会进入 UI 抓取队列
- `pending`
  - 还没抓到可用 Markdown

## 批次规则

每轮默认 `20` 篇。

筛选规则：

1. 只选 `category=ALIDOC`
2. 只选 `needsSync !== false`
3. 按 `path` 层级排序，尽量保持上下级关系连续

## 总进度显示

现在终端会显示两层进度：

### 批次前

```text
Overall progress before batch: current=X/Y, pending=Z, this_batch=N, est_rounds_left=M
```

### 单篇时

```text
[1/20 | overall~273/2013] 文档名.adoc
```

### 批次后

```text
Overall progress after batch: current=X/Y, pending=Z, advanced=A
```

## 加载失败处理

如果钉钉页面出现：

- `加载失败`
- `立即刷新`

脚本会：

1. 自动刷新重试
2. 重试到上限后跳过该文档
3. 把失败记录进 `manifest.json`
4. 继续后面的文档

默认可以配：

```bash
PDF_LOAD_FAILURE_RETRY_LIMIT=5
```

## Git 同步策略

当前策略是：

- 抓取继续跑
- Git 失败只记日志
- 不回头重复下载已经抓下来的文档

这对大批量抓取更省时间。

## 常见问题

### 1. `Could not read package.json`

说明不在项目目录。

先执行：

```bash
cd "/Users/felex/Documents/Codex/生物柴油模式/排产/公司管理"
```

### 2. Playwright 提示浏览器不存在

执行：

```bash
npx playwright install chromium
```

### 3. Git rebase 冲突

抓取可以继续。

后面单独在记忆库仓库中处理：

```bash
git -C "/Users/felex/Documents/Codex/ai-memory-vault-local" status
```

如果是旧提交冲突，可按具体情况处理后再补推。

## 给另一台电脑的最小步骤

```bash
cd tooling/dingtalk-sync-runner
npm install
npx playwright install chromium
MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto
```

如果只想先看不抓：

```bash
cd tooling/dingtalk-sync-runner
npm run registry:management-innovation
npm run analyze:management-innovation
npm run report:management-innovation
npm run batch:management-innovation:auto
```
