# 命令总表

这个仓库现在的定位是：**命令仓**。  
你不用记住所有脚本名，先按板块找，再复制命令跑。

## 先做环境准备

```bash
npm install
npx playwright install chromium
cp .env.shared .env
npm run check
```

## 最常用入口

```bash
npm run help
npm run help:management-innovation
npm run help:digital-drive
npm run help:meeting-minutes
npm run help:catalog
```

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

## 规则

1. 先看 `help` 或这个文件，再决定跑哪条。
2. 板块级命令优先，不要一上来用底层命令。
3. UI 抓取默认会按 `nodeId + modifiedTime + needsSync` 避免重复。
4. 页面加载失败会自动刷新重试，超过上限就跳过并记日志。
5. 状态仓是 `ai-memory-vault`，这个仓库是执行仓。
