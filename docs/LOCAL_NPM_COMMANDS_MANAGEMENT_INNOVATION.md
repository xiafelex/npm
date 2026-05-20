# 管理创新本地命令清单

## 目录

```bash
cd tooling/dingtalk-sync-runner
```

## 安装环境

```bash
npm install
npx playwright install chromium
```

## 全量管理创新：一条命令自动跑

```bash
MI_VAULT_GIT_COMMIT=1 MI_VAULT_GIT_PUSH=1 npm run sync:management-innovation:auto
```

## 全量管理创新：只预览待抓清单

```bash
npm run registry:management-innovation
npm run analyze:management-innovation
npm run report:management-innovation
npm run batch:management-innovation:auto
```

## 管理创新-前两层：续跑旧工作集

```bash
npm run index:management-innovation:front2
npm run analyze:management-innovation:front2
npm run report:management-innovation:front2
npm run batch:management-innovation:top20
PDF_LOAD_FAILURE_RETRY_LIMIT=5 npm run sync:management-innovation:top20:md
```

## 说明

- `sync:management-innovation:auto`
  - 会先刷新整棵管理创新的结构和台账
  - 然后按层级顺序挑出 `needsSync !== false` 的文档
  - 每轮抓 `20` 篇
  - 每轮后尝试同步到 `ai-memory-vault-local`
- Git 同步失败不会阻止后续抓取
- 页面加载失败会自动刷新重试，超出上限后跳过并记录
