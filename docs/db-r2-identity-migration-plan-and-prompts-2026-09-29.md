# 作品身份与 D1/R2 迁移计划

日期：2026-09-29。供另一线程在当前整体整改完成后接手。此计划针对真实业务数据结构和对象引用，不能与当前图片事务修复并行实施。

## 目标

移除将 `YYYYMMDD_author` 文件名当作品身份的历史约定。作品用现有 `commissions.id` 维护内部关系，并由不可变 `public_id` 提供外部身份；日期、作者、角色、内容和图片分别使用字段/关系。公开 UUID 驱动搜索、锚点与 RSS，旧文件名只用于图片本地路径映射和追溯，不再是运行时事实源。

预期模型（按 2026-09-29 生产基线修订）：

```text
characters(id, name, status, sort_order)
creators(id, display_name, normalized_key, aliases)
commissions(
  id, character_id, creator_id NULL, work_date,
  links, design, description, hidden, keyword
)
source_images(
  commission_id UNIQUE, object_key UNIQUE,
  mime_type, byte_size, sha256, updated_at
)
```

- `id` 沿用现有整数主键和内部外键；另加不可变 UUID `public_id` 用于页面、RSS、可分享链接与对外身份。两者一一对应但职责不同：整数负责存储关系/既有排序，UUID 不泄露创建顺序。图片 manifest 可保留内部 id 关联，所有公开锚点及搜索 JSON 使用 public UUID。
- `work_date` 先确认旧日期字段代表何种业务日期；日历日用 ISO `YYYY-MM-DD`，不加时区。
- `creator_id` 允许未知作者。显示名称变更不应重命名作品或 R2 对象；别名规范与同名作者合并要显式处理。
- 作品可独立拥有同一天、同作者的多条记录；不加 `(creator_id, work_date)` 唯一约束。
- 每个 Part 都是独立作品，有独立 `public_id`、图片和内容；显式可选 `work_group_id` + 正整数 `part_number` 只表达同一多部分委托的关系，不合并作品行。不得用共同作者、日期、角色、外链或图片相似性自动归组。
- `links` 保序且整体随作品读写，继续 JSON；`aliases` 继续数组字段，除非新需求证明数据库内需要逐别名检索或唯一约束。关键词拆表另立工作包，不与身份迁移捆绑。
- 图片关联按 `commission_id`，对象路径不嵌入可变作者/日期。已有对象可以保持原 key，只迁 metadata 引用；新 key 可用 `commissions/<id>/<sha256>.<ext>`。最终按当前 R2 协议确认。

## 现有消费者和兼容边界

旧文件名解析当前支撑时间线、作者/日期搜索、RSS、图片 stem 与 manifest、作品锚点、preview/part 合并。改数据库表不够；必须同一迁移完成：

1. domain 与后台表单/API 的读写字段。
2. fact-source 导出 schema/version、导出文件和源图片 manifest。
3. 图片 resolver 从按文件 stem 猜测转为 commission ID -> manifest path/object key。
4. 搜索元数据、日期排序、作者别名与统计。
5. RSS 日期/作者显示，作品 fragment 及既有浏览器书签兼容。
6. preview/part 数据盘点。原逻辑会剥后缀并只留字典序最大的记录；迁移不得默认删除或合并。当前基线确认有 6 组、12 条明确的 Part 1/2；全部保留为独立作品并设置 `work_group_id` / `part_number`。preview 仍按既有兼容语义处理，不能误分类为分部。

建议新的分享逻辑 ID 使用 `#commission-<publicId>`。页面上 character/timeline 可能同时挂载相同作品，实际 DOM anchor 应按视图加前缀，并由导航 resolver 将逻辑目标定位到当前可见视图，避免重复 ID。fragment 不会发送至服务端，所以旧锚点映射需随静态页面导出并由客户端解析。旧锚点已存在日期冲突时，只能兼容既有确定性落点，不能推断原用户想指向哪条。

## 阶段和闸门

### 0. 等待与基线

- F01–F16 审计整改已提交为 `e2f79c9`。开始迁移时仍须基于最新 HEAD 复核 D1/R2 事务、不可变对象 key、API 文档和工作区状态；不要向共享工作区叠加同一批修复。
- 开始时复核 `git status`、HEAD、相关 migrations/API/导出器和新增 API 文档；有未提交改动时停止迁移实施，改用只读研究或独立 worktree。
- 查阅 Cloudflare 官方当前 D1/R2 文档与仓库实际 binding；禁止从记忆猜 D1 transaction/batch、迁移和 R2 copy/delete 语义。

### 1. 只读盘点与可回放映射

- 从 D1 读取作品、作者/角色 alias、source image metadata；只读枚举 R2 对象和大小/类型/哈希。
- 输出每个 `commission.id` 对应旧文件名、待回填日期、规范作者、R2 key 与 SHA-256、manifest 本地路径、旧 anchor、preview/part 判断来源。
- 列出无法无损自动处理的行：日期无效、空作者、归一化冲突、同名差异、缺失图片、R2 孤儿、多个 key 匹配、preview/part 不确定。保留人工判定字段，不默默选一个。
- 映射文件避免输出不必要的 links/description 等敏感内容；对业务数据加权限保护，计划交付只留计数和哈希摘要。
- 验收：作品数映射完整；所有图片要么一对一匹配且 hash 一致，要么有明确 exception；重复运行盘点输出稳定。

### 2. 离线迁移演练

- 使用隔离 D1 副本/本地 SQLite fixture 与 R2 下载副本，运行新增的前向迁移；历史 migration 文件保持不改。
- 迁移分成可前向恢复步骤：新增 nullable 列/表、回填、验证，再切换读路径。不要在一次 SQLite 表重建里顺便删旧字段。
- R2 不支持与 D1 跨存储原子事务。先把所需对象准备好并逐字节校验，再切 D1 引用；失败保留旧对象。不可验证引用已提交状态时，不清旧对象。
- 做中断/重跑演练：迁移任务在每个阶段停止后再次运行必须幂等；未被新引用且尚在回滚保留期的 R2 对象不删除。
- 验收：旧/新记录数与字段分布对照、hash 一致、外键与唯一规则一致、搜索/日期/anchor/RSS 静态输出正确。

### 3. 应用与导出切换

- 修改 API、表单与 domain 使结构化字段成为唯一可编辑来源；旧 fileName parse 只存在于一次性 import/backfill 工具。
- 新的 fact source 递增 schemaVersion，并校验构建只读消费一个一致 revision。
- 切换 source-image manifest 到 commission ID。既有对象不需要全量改名或复制。
- 一次发布同时更新静态页面和 fragment resolver，保留旧 anchor 映射；缓存键/manifest revision 必须随着结构性变化变化。
- 增加真实 D1 外键、unique 和中途失败回滚测试，以及本地 R2 测试；不以 mock 成功代替存储约束。
- API/schema/data contract 修改同步 `docs/api-reference.md`、`docs/ai-agent-guide.md`、受影响 AGENTS。

### 4. 业务环境预检和执行审批

- 生成确切将运行的 migration SQL/脚本、目标 D1 名、账户/环境、读写范围、对象保留/回收策略、预计行/对象数、耗时边界、备份点和恢复演练结果。
- 先用真实环境只读核对 migration 历史、schema、行数、索引及 R2 key/hash。只读观察不得触发 export 写回。
- 把生产 D1 DDL/DML 与 R2 put/delete 分开列清；设置每步停止条件。业务写入窗口内须采用维护窗口或经证明不会漏写的双写/增量捕获协议。
- 给出可执行的回滚/前向修复。若新代码写入结构化字段，回滚应用前需确保旧字段可重建，或明确为何采用只前滚的修复策略。
- 完成上述具体产物后停下，由用户在执行线程中明确批准生产写入；未获批准不得对业务 D1/R2 执行 migration、put、copy、delete 或部署。

本轮授权：用户已明确要求完成全部数据迁移并部署整个新数据库。该授权覆盖本节所列的 D1 migration 与 Worker/Admin/Web 发布；仍须满足前置备份、状态核对和停止条件。

### 5. 清退旧协议

只有当新 API、所有部署版本、导出器、manifest 消费方与业务数据都使用 ID/显式字段，且旧链接兼容覆盖期通过后，才考虑移除旧列或旧映射。以单独迁移实施，并确认回滚不再依赖旧列。严禁在迁移当天永久删除旧 R2 对象。

## 必须提供的验收证据

- D1 migration 前后 schema、索引、外键和行数摘要。
- 盘点 exceptions 全部有处置记录；已迁记录日期/作者/ID 与映射一致。
- 所有关联 R2 图片真实下载哈希相同；新 manifest 映射唯一且完整；无引用对象只有经过保留期与再次核对才可回收。
- 141 条作品各有且仅有一个稳定 UUID；12 条 Part 作品仍为 12 条、组成 6 对、每组顺序唯一；列表/搜索保留两个部分，RSS/摘要明确只折叠 preview 而不折叠真实 Part。
- 同日同作者多作品、未知作者、作者改名、改日期、换图、preview/part、多角色切换、旧书签、RSS 均有具体 fixture 验收。
- 同一 content revision 重复导出结果稳定；没有构建隐式写回生产 D1。
- 生产执行记录精确环境、迁移号、revision、对象统计、停止条件与实际结果；不将本地通过表述为生产成功。

## 本轮执行状态（2026-09-29）

- 已实现 additive migration `0005_public_commission_identity_and_parts.sql`：141 条作品逐条回填 UUID，原整数关系键及 R2 对象不变；12 条 Part 1/2 仍为独立记录并显式归为 6 组。
- 已将 schema 升至 v3：Web 公共身份改用 `publicId`，Part 组与编号进入内容快照/API；匿名作者渲染为 `Anon`。
- 生产发布状态以本轮实施记录为准；应用迁移前仍须导出生产 D1 备份并核验迁移列表、精确映射命中和数据守恒，不能把离线回放当成线上完成证据。

## 供另一线程使用的提示词

### 提示词 A：只读盘点与迁移设计

```text
请按 docs/db-r2-identity-migration-plan-and-prompts-2026-09-29.md 做阶段 0 和阶段 1，只读执行。

背景：commission fileName 的 YYYYMMDD_author 是旧 hack；期望最终使用现有 commissions.id 作稳定作品身份，日期/作者为字段，source_images 以 commission_id 关联。先确认你读取的是最新 HEAD，当前整体整改工作区是否干净以及 D1/R2 事务、不可变图片 key 改动的最终契约。若相关文件尚未收口，不要修改共享目录。

核对完整消费者：后台表单/API、domain、Astro 时间线/搜索/RSS/anchors、preview/part 去重、fact-source schema 与图片 manifest。对真实业务 D1/R2 仅允许只读盘点；不得跑迁移、导出写回、上传、复制、删除或部署。

交付：数据映射方案、旧链接兼容方案、所有歧义/exception 及计数、schema 与分阶段 D1/R2 操作、回滚/前向恢复设计、验证步骤和明确的生产执行边界。不要实现代码。基于证据指出任何不适用本计划的字段或关系，不要擅自推断日期含义或合并作者。
```

### 提示词 B：离线实现和演练

```text
在另一线程已审定的只读盘点与迁移设计上实施代码和隔离 fixture 演练；不得连接生产 D1/R2，也不得部署。

开始前确认最终基线、相关 API 文档和当前 AGENTS。实现结构化 commission ID/date/creator、ID 驱动图片 manifest、搜索/时间线/RSS/锚点兼容，以及新增前向迁移。保持历史 migration 原文件不变。保留未分类的 preview/part 记录，歧义输出待定清单。不要把关键词拆表或其他重构塞入本次变更。

补真实 SQLite/D1 约束测试和离线对象 store 故障/重跑测试，完成 typecheck、lint、相关单测与静态构建。比较行为与基线，报告明确运行结果、迁移兼容窗口、不可逆边界和未实现项。只提交可审查的本地差异，不部署、不对真实 D1/R2 写入。
```

### 提示词 C：业务环境只读预检与审批材料

```text
离线迁移实现通过后，对指定业务环境进行只读预检，并形成可执行但尚未执行的生产变更包。

先核对账号/环境/数据库名称、migration 历史、实际 schema/index/foreign key、作品和 source_images 数量、对象 key/hash、exceptions 与备份能力。只读操作不得调用可能修复/回写 metadata 的 export 路径。确认如何识别读取工具的副作用。

给出逐条 SQL/script、精确目标、预计影响行数/对象数、备份和恢复演练、写入窗口/并发编辑保护、每步前置断言与停止条件、对象保留和延迟回收期。对 D1 DDL/DML、R2 put/copy/delete 和应用 deploy 分别说明。完成预检后停下，等待用户明确批准生产写入；不得自行执行任何生产变更。
```

### 提示词 D：获得明确授权后的受控执行

```text
仅在当前线程已有针对具体 D1 环境、R2 bucket、迁移号与步骤的明确用户批准后执行 production change。重新验证审批材料所用 commit/revision、目标环境、备份和远端当前状态；不套用过期 dry run。

严格按批准的分段顺序执行。每一步先断言目标及影响数，再做单步变更，然后查询验证行数、字段、引用和哈希。任何前置断言失败、数量超限、映射不唯一、对象校验失败或状态与计划不符，立即停止，不自行扩大范围。旧 R2 对象保留，不执行计划外清理。

完成后报告真实环境、migration、revision、影响计数、抽样和全量校验结果、恢复点及任何未决项。不得把未执行的步骤标记成功。
```

## 适用限制

本文件是一份预案，不证明真实业务环境已盘点、可备份或已迁移。D1 和 R2 分属两个持久化系统，任何单侧成功都不能代表整体完成。未批准的生产步骤保持未执行。
