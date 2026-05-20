# DingTalk Sync Runner Branch

这个说明面向测试分支 `codex/dingtalk-sync-runner`。

## 目标

这个分支提供一个“可 clone、可安装、可直接运行”的执行仓副本，用来抓取钉钉知识库，并把结果同步回 `ai-memory-vault` 主分支所承载的状态体系。

## 仓库角色

- `main`
  - 状态仓
  - 保存 `raw-md / sync-registry / report / runbook`
- `codex/dingtalk-sync-runner`
  - 执行分支
  - 保存可运行的 `npm + Playwright + scripts`

## clone 后怎么用

```bash
git clone --branch codex/dingtalk-sync-runner https://github.com/xiafelex/ai-memory-vault.git
cd ai-memory-vault/tooling/dingtalk-sync-runner
```

如果你用 SSH：

```bash
git clone --branch codex/dingtalk-sync-runner git@github.com:xiafelex/ai-memory-vault.git
cd ai-memory-vault/tooling/dingtalk-sync-runner
```

## 目录说明

执行代码在这里：

- `tooling/dingtalk-sync-runner/`

里面包含：

- `package.json`
- `package-lock.json`
- `scripts/`
- `.env.example`
- `docs/`

## 环境准备

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

然后编辑 `.env`，至少填：

- `DINGTALK_APP_KEY`
- `DINGTALK_APP_SECRET`
- `DINGTALK_OPERATOR_ID`

## 浏览器

脚本优先尝试系统 Chrome。

如果 Chrome 不在默认位置，可以先设置：

```bash
export PDF_BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## 管理创新：整棵自动抓取

```bash
MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto
```

## 先预览，不抓取

```bash
npm run registry:management-innovation
npm run analyze:management-innovation
npm run report:management-innovation
npm run batch:management-innovation:auto
```

## 关键规则

1. 先对比 `nodeId + modifiedTime + needsSync`
2. 只抓当前版本还没落到 `ui_md_current` 的文档
3. 按层级路径排序，尽量保持上下级连续
4. Git 同步失败时继续抓，不重复下载已经抓到的文档
5. 页面加载失败时自动刷新重试；多次失败后跳过并记日志
