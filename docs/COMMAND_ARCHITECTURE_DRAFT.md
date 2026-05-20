# 命令架构重构草案

这份草案不直接改现有可跑命令，先回答三个问题：

1. 现在的命令哪里重复了
2. 现在的层级哪里混了
3. 以后应该按什么结构继续长

## 当前结论

`package.json` 里的命令已经能跑，但命名层级不够稳定。

最核心的问题不是某一个板块，而是：

- **数据来源**
- **内容类型**
- **板块/工作集**
- **动作**

这四层现在混在一起了。

## 当前命令的大类

### 1. 数据来源：钉钉

目前绝大部分命令都来自钉钉，但钉钉下面又分成了不同内容类型：

- 知识库
- 日志 / 日报
- 会议纪要

所以“管理创新 / 数字驱动 / 技术中心总表 / 会议纪要”不应该被看成同一层。

### 2. 内容类型

#### A. 钉钉知识库

代表命令：

- `index:tech-center`
- `index:management-innovation`
- `index:digital-drive`
- `sync:wiki-section`
- `sync:management-innovation:auto`
- `sync:digital-drive-algorithm-group:top20:md`

#### B. 钉钉日志 / 日报

代表命令：

- `sync:logs`
- `token:user`

#### C. 钉钉会议纪要

代表命令：

- `sync:meeting-minutes:all:fast`
- `sync:meeting-minutes:vault:push`
- `status:meeting-minutes`

## 当前结构里的重复和混乱

### 1. 管理创新这组重复最多

当前同时存在：

- `management-innovation`
- `management-innovation:front2`
- `top5 / top10 / top20`
- `auto / md / vault / round / loop`

这些其实属于四个不同维度：

- 范围：整棵 / front2
- 批次：5 / 10 / 20
- 目标：md / vault
- 模式：auto / round / loop

现在它们全都写进同一个命令名里，所以可读性比较差。

### 2. 数字驱动的抽象层级不一致

当前：

- `digital-drive` 更像“总表”
- `digital-drive-algorithm-group` 才是真正可抓取工作集

所以数字驱动这组命令现在不是一条完整层级，而是：

- 板块总表
- 子工作集执行流

### 3. 会议纪要是专项流，不应与知识库板块并列

`meeting-minutes` 虽然也来自钉钉，但更像：

- 一个内容类型
- 一个专项同步流

它不应该和 `management-innovation`、`digital-drive` 这种知识库板块放在同一层理解。

## 推荐的长期分类

建议以后按 4 层理解：

### 第一层：数据来源

- `dingtalk`
- 以后可能还有：
  - `wechat`
  - `erp`
  - `local`
  - `mail`

### 第二层：内容类型

- `wiki`
- `logs`
- `meeting`
- `contacts`
- `tasks`
- `forms`

### 第三层：板块 / 工作集

对知识库来说，例如：

- `tech-center`
- `management-innovation`
- `digital-drive`
- `digital-drive-algorithm-group`
- `center-office`

### 第四层：动作

- `index`
- `registry`
- `analyze`
- `report`
- `batch`
- `fetch`
- `syncback`
- `loop`
- `status`

## 用这个模型看现有命令

### 管理创新

现有：

- `index:management-innovation`
- `registry:management-innovation`
- `analyze:management-innovation`
- `report:management-innovation`
- `batch:management-innovation:auto`
- `sync:management-innovation:auto`

建议未来理解为：

- 来源：`dingtalk`
- 类型：`wiki`
- 板块：`management-innovation`
- 动作：`index / registry / analyze / report / batch / loop`

### 数字驱动-数据算法研究组

现有：

- `probe:digital-drive-algorithm-group`
- `sync:digital-drive-algorithm-group:api`
- `batch:digital-drive-algorithm-group:top20`
- `sync:digital-drive-algorithm-group:top20:md`
- `round:digital-drive-algorithm-group:20`

建议未来理解为：

- 来源：`dingtalk`
- 类型：`wiki`
- 工作集：`digital-drive-algorithm-group`
- 动作：`probe / fetch-api / batch / fetch-ui / loop`

### 会议纪要

现有：

- `sync:meeting-minutes:all:fast`
- `sync:meeting-minutes:vault:push`
- `status:meeting-minutes`

建议未来理解为：

- 来源：`dingtalk`
- 类型：`meeting`
- 工作流：`monthly-meeting-minutes`
- 动作：`fetch / status / syncback`

## 现在不建议立刻大改的部分

为了不打断现有工作流，下面这些事情先不要一起做：

1. 不要一次性重命名全部 npm scripts
2. 不要先删掉旧命令
3. 不要把批量大小、范围、动作同时重构

## 建议的渐进式做法

### 第一步：文档先统一分类

也就是现在正在做的：

- `README`
- `COMMAND_INDEX`
- `help:*`

先按：

- 来源
- 内容类型
- 板块
- 动作

来解释现有命令。

### 第二步：新增 alias，不先删旧命令

比如未来可以先加别名：

- `help:dingtalk-wiki`
- `help:dingtalk-logs`
- `help:dingtalk-meeting`

甚至进一步加：

- `run:dingtalk:wiki:management-innovation`
- `run:dingtalk:meeting:minutes`

但旧命令先保留，避免影响现在已经跑通的机器。

### 第三步：最后再考虑重命名 package.json

等大家都适应新的分类后，再决定是否真正把脚本名切过去。

## 当前最重要的判断

### 这些应该归为一类

下面这些应该统一归到：

- **钉钉 -> 知识库**

包括：

- `管理创新`
- `数字驱动`
- `中心办公`
- `技术中心总表`

### 这些不该和上面放同一层

- `meeting-minutes`
  - 应归于：钉钉 -> 会议纪要
- `sync:logs`
  - 应归于：钉钉 -> 日志 / 日报

## 结论

以后这仓库最稳的分类，不是“先按板块”，也不是“先按动作”，而是：

1. **先按数据来源**
2. **再按内容类型**
3. **再按板块 / 工作集**
4. **最后按动作**

当前仓库已经可以跑，但还处在“命令可用、抽象未完全统一”的阶段。

这份草案的目标，就是先把这个抽象统一起来。
