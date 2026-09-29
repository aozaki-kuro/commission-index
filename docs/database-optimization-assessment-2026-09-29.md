# 数据库结构优化评估与迁移实施计划

日期：2026-09-29。源码基线：`b229648709300babc559f8501450ab5210439849`。

复核时共享工作区 HEAD 已推进至 `2af23c6`（搜索缓存及既有数据库交接文档提交）；数据库迁移与 Worker/Domain 数据模型相关源码未随之变化。本次未执行提交或推送。

状态：**评估已形成；数据库优化、迁移代码、生产盘点和上线均未执行。** 本文依据当前源码、完整迁移文件、本地 SQLite 隔离验证及当日 Cloudflare 官方文档。开始时工作区已有搜索模型修改及两份未跟踪计划；本次不覆盖这些内容。线上 schema、迁移历史、数据规模、脏数据数量、备份能力与延迟仍待只读核实。

本文回答“值不值得做、先做什么、代价多大、如何安全迁移”。[身份迁移交接计划](./db-r2-identity-migration-plan-and-prompts-2026-09-29.md)保留交接提示词；[性能审计](./performance-logic-audit-2026-09-29.md)保留性能发现。实施数据库专项时，以本文补充的约束、闸门和验证要求细化旧预案，不把任何建议视为已部署能力。

## 1. 决策结论

**有必要优化，但应拆成三个决策：先解决迁移安全和索引问题，再决定结构化身份迁移，暂缓没有查询需求支撑的拆表。**

1. **应优先处理：迁移安全、缺失/重复索引、schema 版本管理。** 已有可定位的结构问题；收益主要是减少后台扫描、避免迁移损坏及运行时兼容分支。可以独立交付，不必等待整套作品模型重写。
2. **值得单独立项：作品 ID、日期、作者、图片关系解耦。** 这解决的是编辑、关联和身份稳定性。只要希望自由修改作者/日期、支持同日同作者多作品、降低图片改名副作用，就有明确业务价值。复杂度高于“多加几列”，因为当前公开协议没有作品 ID。
3. **有条件实施：JSON/数值约束、作者规范键、并发版本字段。** 按盘点结果和实际写入冲突引入，不能强加未经确认的业务限制。
4. **暂缓：关键词全量关系化、别名逐项拆表、多作者/多角色关系、FTS、换数据库、分库。** 目前缺乏收益证据；这些可独立演进，不属于身份迁移的先决条件。

公开站是静态构建结果，访客运行时不访问 D1。数据库优化会影响后台操作和导出构建，不能直接承诺公开首页显著提速。结构简化的主要回报，是让改作者不再牵连文件名、图片引用、搜索与分享身份。

### 1.1 优先级、收益和难度

```text
工作包                         必要性         难度       主要收益/决定条件
迁移重放安全与数据守恒          必须           中         防止执行成功却删除数据
作品角色复合索引               高             低         定位角色范围并提供现有排序
角色排序索引、重复索引治理      中             低         降低排序/维护成本，收益需测量
schema 版本门禁与查询收口       高             中         减少探测，阻断半迁移环境
基础数据约束                   中高           中         防止绕过 API 写入无效数据
source_images 改用作品 ID      高（长期）     中高       图片关系不受文件名修改影响
作者/日期显式字段及公开 ID      高（模型目标） 高         解除全链路文件名耦合
关键词/别名关系表              条件成立再做   中高       仅对服务端检索/局部编辑有价值
数据库引擎替换                 暂无必要       很高       当前问题可在 D1 内解决
```

这里的“高”是实施价值，不代表已经发生线上事故。排序索引不是当前主要瓶颈的证明；身份迁移也不能用前端性能名义强行推进。

## 2. 当前结构与事实边界

### 2.1 当前持久化模型

```text
characters
  id INTEGER PK AUTOINCREMENT
  name UNIQUE NOT NULL, status CHECK(active/archived), sort_order
  |
  +-- commissions.character_id FK ON DELETE CASCADE
        id INTEGER PK AUTOINCREMENT
        file_name UNIQUE NOT NULL
        links TEXT, design, description, hidden INTEGER, keyword TEXT

source_images
  commission_file_name TEXT PK  -- 无作品外键
  object_key UNIQUE NOT NULL, mime_type, byte_size, sha256, updated_at

creator_aliases(creator_name TEXT PK, aliases TEXT)
character_aliases(character_name TEXT PK, aliases TEXT)
keyword_aliases(base_keyword TEXT PK, aliases TEXT)
home_featured_search_keywords(keyword TEXT PK, sort_order)
```

实际为 7 张业务表，schema 来自 `apps/admin-worker/migrations/0001` 至 `0003`。`links` 和 `aliases` 在 TEXT 中保存 JSON；`keyword` 是应用规范化的分隔文本。日期和作者从 `file_name` 解析。作品已有稳定整数 ID，无需为了规范化另外发明一套 UUID。

主数据路径：后台 API → D1/R2 → 只读导出 → 带共同 revision 的 content/manifest → Astro。图片新写入已使用带 hash 和随机 UUID 的不可变对象 key；“所有图片还按可变文件名直接覆盖”不是当前代码事实。现存耦合主要在 D1 关联键、API 参数、本地图片 stem 和公开消费者。

### 2.2 关键证据位置

- [三份 migration 所在目录](../apps/admin-worker/migrations/)：表定义、外键、索引及历史表重建。
- [adminData.ts](../apps/admin-worker/src/adminData.ts)：`hasTable` / `hasCommissionKeywordColumn`、角色作品查询、全量作品文件名作者统计、alias-only 词条。
- [adminPersistence.ts](../apps/admin-worker/src/adminPersistence.ts)：运行时 `ensure*Table`、D1 batch、手工关系更新、角色排序与删除。
- [adminApi.ts](../apps/admin-worker/src/adminApi.ts)、[adminSourceImages.ts](../apps/admin-worker/src/adminSourceImages.ts)：图片准备、metadata 提交和旧对象清理顺序。
- [content.ts](../packages/domain/src/content.ts)、[factSource.ts](../packages/domain/src/factSource.ts)：公开 `Commission` 没有作品 ID；当前 schemaVersion 为 1；manifest 用 `commissionFileName`。
- [commissionFileName.ts](../packages/domain/src/commissionFileName.ts)：八位前缀校验及字符串切片，不验证真实日历日期。
- [exportWebFactSource.ts](../apps/admin-worker/scripts/exportWebFactSource.ts)：`factSourceSnapshotTables` 中作品 SELECT 未输出作品 ID；单 SELECT 快照和 hash/size 验证已实现。
- [CommissionEntries.astro](../apps/web/src/features/home/commission/CommissionEntries.astro)、[rss.ts](../apps/web/src/lib/rss.ts)、[updateSummary.ts](../apps/web/src/lib/home/updateSummary.ts)：公开渲染、RSS、preview/part 与汇总口径。
- [unpublishedInterestClient.ts](../apps/web/src/features/home/commission/unpublishedInterestClient.ts)：兴趣状态 localStorage 和 analytics `sub_event` 的持久身份。

这些是当前源码证据，不替代实际数据库检查。既有审计中的概览“26 条 SQL / 11 次探测”是替身计数，不能当作线上延迟测量；实施时重新记录新基线。

## 3. 必须先处理的风险

### 3.1 旧迁移 0003 的级联删除风险

`0003_rename_stale_to_archived.sql` 的流程为建 `characters_new`、复制角色、`DROP TABLE characters`、重命名新表。旧 `commissions.character_id` 使用 `ON DELETE CASCADE`。

隔离验证使用 Python SQLite 3.53.4，在 0001/0002 后插入一个角色、一条作品、一条图片 metadata，再执行 0003，结果为：

```text
条件                                 characters  commissions  source_images  foreign_key_check
迁移前                               1           1            1              []
foreign_keys=ON                       1           0            1              []
foreign_keys=ON + defer_foreign_keys   1           0            1              []
```

**SQL 成功和外键检查为空均不能证明数据保留。** SQLite 删除父表可以触发外键动作；延迟检查不会取消 CASCADE。[SQLite 外键文档](https://www.sqlite.org/foreignkeys.html)和 [D1 外键文档](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)支持这一风险判断；本次没有在远端 D1 重放，不能声称生产已丢作品。

当前 `adminPersistence.test.ts` 在空库跑完三份 migration 后才写测试数据，`exportWebFactSource.test.ts` 的 fixture 只跑前两份，因此既有测试不覆盖这个升级场景。新增验证必须在 0003 之前插入父子记录。

实施前区分三种环境：

- **已应用 0003 的生产环境：** 不重跑历史迁移。核对迁移时间、作品 ID 集、已知历史清单和备份；若发现损失，另立数据恢复任务，追加索引不能恢复已丢行。
- **已有数据但 0003 未应用：** 禁止直接运行“应用所有剩余迁移”。必须先设计并演练保全所有子表的受控升级路径；仅追加一个 0004 无法阻止先执行 0003 时的数据损失。迁移历史对齐也需显式审核，不能假造已执行记录。
- **全新空环境：** 空库建表不会暴露上述数据损失，应在装载业务数据前完成 schema 初始化；同时必须额外测试“老版本带数据升级”。若以后整理 schema baseline，保留已部署迁移历史并定义新旧环境入口，不能静默重写旧文件。

未来重建任意被引用表，都需盘点入向外键、触发器、索引、唯一约束、ID 及自增序列。优先使用可行的加列/加表方案；确需重建时，在副本上证明父子数据、引用和后续新增 ID 都完整。不要在 D1 中照搬 `PRAGMA foreign_keys=OFF` 或外部 `BEGIN/COMMIT` 脚本；D1 有自己的事务执行约束。

### 3.2 索引调整应小步独立交付

按完整迁移后的仓库 schema：

- `commissions` 缺 `(character_id, file_name DESC)`，而角色详情按角色筛选并按文件名倒序。新增该复合索引，保留 `file_name` 唯一约束；同 fixture 比较实际完整 SELECT 的结果和 EXPLAIN。
- 0001 的 `idx_characters_sort_order` 被 0003 的表重建删除。恢复前先测试真实角色列表的 JOIN/GROUP BY，而不只测试简单排序；小表上允许优化器选择扫描。
- `source_images.object_key UNIQUE` 已建自动唯一索引，显式 `idx_source_images_object_key` 重复。只有远端 `index_xinfo` 的列、顺序、collation、partial 条件均一致且没有 `INDEXED BY` 依赖时，才删除显式索引。

候选 SQL 仅表达设计，**不作为未经预检可执行的生产迁移**：

```sql
CREATE INDEX idx_commissions_character_file_name
  ON commissions(character_id, file_name DESC);
CREATE INDEX idx_characters_sort_order ON characters(sort_order);
DROP INDEX idx_source_images_object_key;
```

实施时分配最新未占用的迁移号，检查同名不同定义的索引。不要用 `IF NOT EXISTS` 掩盖 schema 漂移。身份切换以后若查询变为 `ORDER BY work_date DESC, id DESC`，再评估 `(character_id, work_date DESC, id DESC)`；没有旧查询消费者后才移除旧复合索引。

### 3.3 约束强化有价值，但不能“一键加外键”

- 当前普通 rowid 表的 `TEXT PRIMARY KEY` 不等同显式 `NOT NULL`。隔离插入验证允许 NULL，部分键还能出现多个 NULL。应盘点这些行，目标键显式 `NOT NULL`，而不是只依赖 UI 校验。
- 候选 `hidden CHECK(hidden IN (0,1))`、正数整数 `byte_size`、非空对象 key、规定格式的 SHA-256、JSON 数组类型检查，可保护脚本/直接 SQL 写入。先清点历史数据，再增约束。JSON 有效且顶层是数组不代表数组元素一定是字符串，元素及 URL 规则继续在域层验证。
- 日期先作严格日历验证，包括闰年、不存在的月日；仅八位数字或 `YYYY-MM-DD` 格式约束不足。不能把非法日期自动归一到下个月，也不能以迁移当天日期补齐未知日期。
- 不能直接给 `source_images.commission_file_name` 加作品 FK：当前改名 API 先保存新文件名 metadata，后更新作品；原顺序会被新 FK 拒绝。应与提交顺序/稳定 ID 关系一起设计。
- `character_aliases` 包含尚无作品或角色实体的独立词典项，读取会合并 count=0 的 alias-only 名称。不能无条件改成 `characters.name` 外键并级联删除；作者词典也需先盘点独立词条。
- 不给 `sort_order` 草率加全局唯一约束。当前 active/archive 分组排序和批量重排可能出现合理重复值；先规定排序域及稳定 tie-breaker，再讨论唯一性。

数据库约束负责保证关系和基本形状；作者是不是同一个人、日期是什么含义、preview 是否同一作品，必须由业务规则和明确映射决定。

### 3.4 schema 真值应交给部署流程

当前读路径反复探测表/列，写路径仍有 `CREATE TABLE IF NOT EXISTS`。这是运行时与迁移文件共同维护 schema 的双重来源。目标是迁移完成后应用仅执行 DML，发布前校验所需 schema 版本与关键约束，版本不符显式失败。

顺序：补全迁移历史和环境盘点 → 增加发布前 schema 门禁 → 验证所有线上实例兼容 → 移除热路径探测与 ensure DDL。不要先删探测导致未升级环境突然失败，也不要只缓存一次错误判断永久掩盖漂移。迁移记录需结合 `sqlite_schema` 实际定义核对，不能只看版本号。

### 3.5 稳定 ID 不能自动解决并发编辑

D1 batch 保证一个批次的事务性，不保证批次之外“先读再写”的业务决策不会过期。两次图片替换、改名与替换、角色删除与上传都需单独验证。若真实编辑/自动化允许并发，优先使用 `version` 条件更新或带旧 object key 的比较交换，并明确冲突响应；D1 更新与新图片引用必须在同一成功条件下提交。

这种并发协议要有可验证的 affected-row 判定；更新命中 0 行不能被当作成功。暂未引入版本字段时，维护窗口须覆盖全部写入口，不能靠“应该只有一个人操作”成立。

## 4. 目标模型：最小实现与演进边界

### 4.1 推荐的最小模型

```text
characters(id, name, status, sort_order)            保留现有角色与单角色归属
creators(id, display_name, normalized_key, aliases) 作者实体；名称不再是关系键
commissions(
  id, character_id, creator_id NULL, work_date,
  links, design, description, hidden, keyword
)
source_images(
  commission_id INTEGER PRIMARY KEY REFERENCES commissions(id),
  object_key TEXT NOT NULL UNIQUE,
  mime_type, byte_size, sha256, updated_at
)
legacy 映射：旧文件名/旧 fragment -> 作品 ID，受限追溯与公开兼容分开
```

这是逻辑模型，不是最终建表 SQL。`work_date` 是否必填取决于日期语义和异常盘点；过渡期允许 NULL，但不要让未知日期悄悄变成有效时间线项。作者允许未知；显示名称与规范键都不天然唯一，`normalized_key` 是否加 UNIQUE 必须等同名/Unicode/别名冲突裁决后再决定。

- 沿用作品 ID，迁移不得重编号；新建作品继续由同一身份机制分配。静态 JSON 使用 number 时校验安全整数边界，避免无声精度损失。
- 一个作品当前至多一个 source image；允许“暂时无图”的作品，不能凭 FK 推导每条作品必有图。required-image 集合由现有业务状态和导出规则确定。
- 候选图片 FK 使用 `ON DELETE CASCADE` 可自动清 metadata，但删除之前须保留待回收 object key；D1 级联不会删除 R2。若采用 RESTRICT，需显式删除次序。推荐保留现有对外删除语义，不在本项目中另改角色删除政策。
- 作者删除默认 RESTRICT；确需保留作品并置未知作者时，单独定义 `SET NULL` 流程。不要级联删除作者名下作品。
- `links` 保序、整体读取和修改，继续 JSON。`aliases` 保持现有数组语义；JSON 本身不是坏设计。
- `keyword` 暂留文本；有数据库内筛选/聚合/局部编辑需求再考虑 `keywords` 与 `commission_keywords`。暂不做 EAV 或通用 `owner_type/owner_id` 表。
- 不加 `(creator_id, work_date)` 唯一约束，同日同作者多作品必须可独立存在。

### 4.2 为什么不直接做“完全规范化”

完全拆分作者别名、链接、标签、多角色、多作者、图片版本，会同时引入 JOIN、写入事务、排序字段、编辑 UI 和删除策略。当前没有证据表明这些成本都能换回收益。理想的边界是：作品身份稳定，字段各司其职；这不要求每个数组都变成表。

未来真实出现多作者合作、作品跨角色、服务端标签筛选时，再分别引入关联表，并明确 credit 顺序、主角色、别名冲突和删除行为。相关需求若在阶段 0 被确认已经存在，应先修订模型，不把多个作者拼成一个假的 creator 名称。

### 4.3 R2 迁移默认只换关系，不搬图片

既有对象 key 可以继续保留，即使字符串里含旧作者/日期；将它当作不透明且不可变的地址。作品改作者/日期后不必重写对象。这样迁移主要成本是读取校验和 metadata 回填，不是全量复制图片。

旧预案提到 `commissions/<id>/<sha256>.<ext>`，这只是候选，**不能未经分析替换现有每次写入带 UUID 的隔离语义**。同内容并发上传若共用 key，失败补偿可能删掉另一请求已提交的对象。最小方案沿用每次上传唯一的对象版本和随机后缀；内容寻址去重另需引用/回收协议。

当前创建流程先上传图片，再由 D1 INSERT 分配作品 ID，因此上传时尚无 ID。优先使用与业务字段无关的 opaque upload key，提交 metadata 时再绑定 `commission_id`；无需为路径美观引入预留 ID/草稿生命周期。稳定关系不要求 R2 key 包含作品 ID。

R2 强一致性不等于 D1/R2 有跨系统事务；CDN 还可能保留旧响应。[R2 一致性说明](https://developers.cloudflare.com/r2/reference/consistency/)只保证对象存储自身的可见性。顺序仍是准备并验证对象 → 原子提交 D1 引用 → 保留旧对象 → 独立受控回收。

## 5. 必须先定稿的业务规则

以下决策不阻塞本次写文档，但会阻塞最终迁移 SQL/生产放行。每项记录负责人、选择、样本及批准日期。

1. **日期含义：** 现有八位日期代表约稿、交付还是公开日期？是否允许未知日期？ISO 日历日不带时区；RSS 时间戳转换需保持原有时区/排序语义。
2. **作者身份：** 同名是否可能不同人，大小写/空白/Unicode 是否等价，别名能否跨实体共享，未使用 alias 词条如何保留。当前 `normalizeCreatorName` 仅 trim 并去除严格 `(part N)` 后缀；不要把所有作者名直接 lowercase/NFKC 当作事实身份。
3. **单作者/单角色：** 这是现有表达能力，不一定是全部业务真相；若历史文件名包含合作作者，不自动按逗号或符号拆分。
4. **preview/part：** 原记录保留，逐条标明独立作品、预览、分部或待定。普通列表逐条渲染，RSS/更新摘要会合并，总数另按去后缀集合统计；迁移需分别保持或明确更改这些口径。
5. **旧链接：** 哪些路径、fragment 和图片 URL 对外分享过？兼容保留多久？旧日期锚点已一对多时，只能保留原确定性落点或提供选择，不声称能恢复原始意图。
6. **浏览器持久状态：** 兴趣按钮的角色+日期 key 如何映射至作品 ID？一对多碰撞不得无声复制成每条作品均已点击。analytics 历史事件不假装能回写，保留事件名映射供统计解释。
7. **维护窗口及恢复目标：** 可暂停后台写入多久？是否允许释放新写入后只能前滚？需要多长旧对象保留期？这些决定回滚方案，而非上线之后再补。

## 6. 迁移工作包与依赖

```text
G0 基线/语义/环境盘点
  +-- A 索引与迁移安全治理 --> B schema 门禁与查询收口
  +-- C 全量映射与异常裁决 --> D ID/字段/图片模型离线实现
                                  --> E 全链路演练与恢复演练
                                  --> F 生产预检与受控切换
                                  --> G 观察期与独立清退

关键词拆表、多作者关系、搜索服务：独立候选，不进入当前关键路径
```

### G0：固定基线与只读盘点

- 固定最新已收口的提交、依赖版本、migration 文件 hash；检查正在进行的 D1/R2/搜索任务，避免在共享工作区重复修改。已完成的整改不得因旧预案中的“等待线程”措辞被永久阻塞。
- 对目标账号、数据库名称与 ID、bucket、Worker、构建绑定做交叉核对。仓库配置目前指向 `commission-index-admin-data` / `commission-index-images`，实际执行前仍须核验；`remote: true` 表示本地启动也可能访问远端。
- 只读采集 `sqlite_schema`、各表 `table_info`、`index_list/index_xinfo`、`foreign_key_list`、`foreign_key_check`、迁移历史、行数与按 ID 排序的内容摘要。
- 盘点 source image metadata、实际对象、SHA-256/字节数；R2 ETag 不能直接当作 SHA-256。确认历史无 metadata 的文件名 fallback 是否仍在使用。
- 测量后台代表查询 p50/p95、SQL 次数、rows_read/rows_written、payload bytes、导出时间/内存、对象总字节与数据库大小。冷/热请求分开，多次采样，不将一次网络耗时当作基准。
- 输出 `baseline`、`mapping`、`exceptions`、`decision-log` 四类产物。真实数据放受限目录，不提交完整链接、描述、私有图片或凭证；仓库只留脱敏 fixture 和计数摘要。

**出口：** 目标环境唯一；历史迁移路径无未处理危险；每条作品都有可追溯映射；模型决策明确。未完成时可以继续索引研究，不能进入有损回填。

### A/B：低风险结构治理

- 索引独立 migration、独立回退说明；按当前真实查询测试，不与身份字段一起混改。
- 建立发布前 schema 校验；确认所有环境最低版本后移除读探测及写 ensure DDL。
- 约束修改先列冲突清单；需要重建表的约束不混在“加索引”提交里。
- 不为提高速度改变 aliases、搜索、统计或 API 输出语义。记录优化前后结果等价及实测成本；无明显收益的排序索引可暂缓。

**出口：** 代表查询结果一致、必要索引正确；不依赖运行时建表修补 schema；部署到旧 schema 会明确拒绝而非部分成功。

### C：可回放映射与异常裁决

每行映射至少包含：`commissionId`、原文件名、原角色 ID、原字段摘要、解析日期、原作者字符串、裁决后的 creator ID、原对象 key/hash/size、目标图片关系、旧锚点/interest key、preview/part 分类、裁决来源、映射版本。

- 作品映射以作品 ID 为键，覆盖隐藏、归档和无图记录；另建作者/词典映射及对象引用清单。alias-only 词条没有作品 ID，应保留原词典键、原 aliases、目标作者 ID（如适用）与裁决记录，不能虚构作品来承载它们。
- 解析失败、映射一对多、作者冲突、对象缺失均进入 exceptions；默认停止自动处理，不丢弃记录。
- 同一映射版本重复执行输出稳定；输入摘要变化则使旧映射失效，不覆盖新编辑。
- 作者新 ID 在映射中固定，不能每次重跑按遍历顺序随机生成。把现有规范化差异当作需要审查的变化，不静默“修复”拼写。
- alias parser 还兼容历史手填分隔字符串。增加 JSON CHECK 前须按已有 parser 生成等价数组并保留原值，不能把非 JSON 词典项当垃圾删除；SQLite `NOCASE` 也不能替代现有 JavaScript Unicode 大小写规范化。

**出口：** 每条记录有处置；所有会影响身份/链接的歧义已裁决；允许遗留异常必须逐项写明行为和验收例外。

### D：离线实现

建议把代码分为可独立审阅的提交，但最终切换按兼容矩阵执行：

本次实施按用户要求采用**单次 schema v2 切换**，不把现有数据拆成“先加字段、以后再回填”的多个生产版本。唯一新增的 `0004_commission_identity.sql` 在同一次 D1 migration 中为全部现有作品回填 ISO 日期、原始作者和 `source_images.commission_id`，再建立新查询索引并移除重复索引。日期与作者从后台/API/公开事实源显式读取；旧 `file_name` 对现有行保留为隐藏的资产定位键（避免重写 R2 key），新作品生成不透明资产键。作品日期/作者变化不会修改或搬移任何 R2 对象。此模型完整迁移所有业务行，但有意不重命名现存 R2 对象。

1. 在本地还原备份及独立 D1 环境验证单个 `0004` 的 DDL、全部行回填、外键/唯一性、索引和 ID/计数守恒。
2. Worker/Domain/后台表单使用稳定 ID、显式日期与作者，图片 CRUD 以 ID 找 metadata；编辑业务元数据不重命名、不覆盖、不删除 R2 对象。
3. fact-source 一次升级 schemaVersion，content/manifest 同步携带 ID 和显式字段；snapshot revision 覆盖新增字段及映射，导出保持只读。
4. 图片 registry 使用内部资产键映射到本地路径；历史 R2 keys 原样读取和导出，新作品使用随机不可猜测 key。
5. 搜索、时间线、RSS、汇总计数、逻辑分享目标、延迟 manifest fallback、兴趣状态同步切换；历史 part/preview 聚合通过单独导出字段保留，不再由公开消费者解析日期/作者。
6. API 和 Agent 文档、相关 AGENTS 同步。所有 D1 写入者与导出构建必须在一个发布窗口对齐；发布失败时按 D1/R2 的备份边界整体决策，不留下可写的混合协议状态。

不要先上线“只填了部分新字段”的新读路径。新增字段期间若旧应用仍写入，最终必须在停写窗口内重算映射或核对增量；当前作品没有可靠的完整变更日志，不能靠 `MAX(id)` 捕获更新和删除。

还必须解决旧 `file_name NOT NULL UNIQUE` 对新建作品的限制。推荐最终切换时将旧名迁入只读 legacy 映射或解除旧列必填，并彻底阻断旧读写者；新写入之后默认前滚恢复。若仍要求旧版本随时可运行，就必须暂时限制新模型无法反向表达的输入，或定义唯一、可被旧解析器接受的兼容文件名，并测试所有旧消费者。两条路线在放行前选定，不能一边保留旧必填约束、一边宣称新建只需要 ID/显式字段。

Web 的真实 JSON 读取入口 `apps/web/data/generatedFactSource.ts` 当前依靠 `JSON.parse(...) as T` 类型断言。实施时应在读取边界运行时验证 schemaVersion、ID 完整性和 content/manifest revision 一致性，拒绝缺 ID、旧协议及混合快照；只更新 TypeScript 类型和导出版本号不足以保证输入正确。

兼容细节必须单列：逻辑 `#commission-<id>` 与 character/timeline 的 DOM ID 分开，避免同页重复 ID；同日排序需要明确 tie-breaker；后台 duplicate hints 需接受同日同作者的合法多作品。当前 RSS 未输出 GUID，改 link 可能导致订阅器重发旧条目，需制定稳定 GUID/link 过渡并验证订阅行为。RSS 的作者解析与 domain 并不完全一致，修正差异须登记，不能盲目要求所有旧输出字节相等。

### E：分层演练

- 本地 SQLite：空库全链、每个受支持旧版本带数据升级、约束、CASCADE、ID/序列、失败回滚。
- 隔离 D1：使用独立数据库、独立配置及假数据验证真实执行器的 DDL、batch、参数限制和错误行为；先检查绑定不指向生产。SQLite 通过不能替代这一层。
- 隔离 R2/对象替身：上传失败、hash 错误、D1 提交失败、提交结果未知、清理失败和同内容并发上传。
- 端到端：新旧 fixture 同输入比较业务输出；浏览器验证旧缓存 HTML、新 manifest、当前/归档区块、timeline、hash 回退、无重复 DOM ID、兴趣状态和滚动位置。
- 恢复演练：旧代码+旧 schema、迁移中断、切换后未开放写入、开放写入后的前滚各演练一次，记录耗时。

**出口：** 验收矩阵全部通过，异常有批准结论，恢复路径可执行且实测时间在维护预算内。

### F：生产切换运行手册

本次请求只授权评估文档。后续执行线程须先把最终 SQL、脚本、目标资源、影响数量和恢复材料做成可审查的变更包，再按用户届时授权执行；这里不执行迁移或部署。

推荐短时后台停写，不引入长期双写：

1. 确认代码 SHA、migration hash、映射 hash、环境和批准范围一致；发现漂移立即重新盘点。
2. 暂停所有后台 mutation、脚本和自动化写入；处理在途请求并验证新写入被拒绝。仅隐藏提交按钮不算停写。
3. 暂停 Web 自动导出/rebuild/部署及旧候选任务，取得发布锁；静态旧站继续服务。后台读取能否继续取决于是否重建表及执行器锁行为，不预先承诺零影响。
4. 在停写状态取得 D1 恢复 bookmark/SQL 备份、R2 引用清单与受保护对象副本；保存旧 Worker、Web 构建产物、schema 和 migration 历史；实际演练过恢复才能称为可用备份。
5. 最终重新盘点并确认映射覆盖，逐步执行 schema 扩展、回填、校验和必要约束；每个步骤有编号、前置 hash、预期影响数、后置断言和失败恢复入口。
6. 部署新后台/Worker，仍保持停写；旧缓存 admin 客户端必须能明确刷新或被 API 版本门禁拒绝，不能静默把旧字段写回。
7. 从已验证的新模型导出一次固定快照，核对 schemaVersion/revision 和图片 hash；构建并发布对应 Web。Web 与 Admin 是两个发布目标，不能假设原子切换。
8. 核对后台读取、图片、公开链接、RSS 与旧 fragment；回滚决定在开放写入前作出。生产写入 smoke 如需要，必须使用预先约定的可追踪样本及清理策略。
9. 验收后开放后台写入，恢复新版本 rebuild，排除旧候选发布；记录开放时刻与首个新写入标识，进入观察期。

若真实演练显示停写超过可接受窗口，再评估带版本号和删除捕获的增量迁移；这是另一个复杂度等级，不能临时用双写替代完整协议。

### G：观察与清退

- 默认建议至少观察 7 天，并跨越一次真实新增、修改日期/作者、换图、删除和公开重建；仅过去了若干天不算通过。最终窗口按实际业务频率确定。
- 旧字段/备份、R2 对象的保留期分别定义；对象保留期须覆盖选定 D1 恢复点及业务观察期，不能把 D1 可恢复而图片已删的状态称为可回滚。
- 当前普通换图/改名路径仍会尽力立即清理旧对象。要实现上述保留期，必须同步覆盖这些正常 CRUD 清理入口，或先保护可恢复的对象副本；只让迁移脚本“不删旧图”不够。还需保护已读取旧 metadata、尚未下载图片的并发导出，采用保留窗口或明确的读取租约，保留期限由最长导出/恢复需求共同决定。
- 旧 fragment 映射可以作为长期只读兼容层，不等同保留双写业务模型；含私有信息的完整迁移映射不得发布给浏览器。
- 删除旧列、旧表、旧对象分别作为独立变更；先查询所有代码/任务/已部署版本依赖，再执行。对象 GC 要同时核对当前引用、迁移 journal、回滚保留引用和在途上传，不能只做一次 list 减当前表。

## 7. 回滚与恢复设计

```text
阶段                       可选恢复方式                         禁止的误解
仅加索引/扩展字段           旧代码继续使用；撤回新路径           不必整库恢复
回填中，未切换且仍停写     按 journal 重跑/修复；必要时恢复     多批次不是一个总事务
新模型已切换，尚未开写     成套恢复旧 schema/代码/快照/引用     只回滚 Worker 不够
已开放新写入               优先前滚；有完整日志才做反向迁移     不能直接恢复旧备份丢新编辑
已删旧列或回收旧对象       依赖独立备份和恢复演练               不是代码回滚可解决
```

`file_name` 对同日同作者多作品、未知日期、新作者身份的编码可能不可逆。开放新写入前须明确：是保留足以反向重建的 journal，还是正式接受该阶段“前滚修复优先”。保留旧列本身不能保证新业务数据可以回写旧模型。

D1 Time Travel 是整库原地恢复，会覆盖当前状态、取消在途查询；不是只撤销某张表或某条 migration。官方当前列出的恢复窗口为 Free 7 天、Paid 30 天，实际套餐和 bookmark 可用性上线前确认。[Time Travel 文档](https://developers.cloudflare.com/d1/reference/time-travel/)与[限制表](https://developers.cloudflare.com/d1/platform/limits/)不代表本项目已完成恢复演练。R2 对象需另行保留，SQL 备份也不包含图片字节。

**恢复目标建议：** 在停写窗口内实现迁移导致的数据损失 RPO=0；恢复时间 RTO 由副本实测后填写。开放写入后的 RPO=0 需要所有新增/修改/删除都有可重放记录，当前不能承诺。

## 8. D1 执行与重跑注意事项

- D1 `batch()` 中语句失败会回滚该批次，但跨多个 batch、CLI 调用、R2 操作没有总事务。[官方 batch 说明](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。网络超时可能使提交结果未知，先查询后置状态再重试，不能自动清掉疑似未使用对象。
- 使用 `d1_migrations` 管理 schema 版本；数据回填额外记录批次范围、输入 hash、输出 hash、迁移版本及完成状态。不要把 `INSERT OR IGNORE` 当作成功，它可能掩盖漏行/冲突。
- 每批以稳定 ID 范围推进，已迁行需核对源摘要；检查数量相等且内容相符后才标完成。父表先有实体，子关系再回填，未知状态停止。
- 当日限制表列出单查询最多 100 个绑定参数、SQL 100 KB、查询时长 30 秒、单字符串/行约 2 MB。按每行参数数计算批量大小并留余量；大回填按实测分批，重建表还需评估临时容量。[D1 限制](https://developers.cloudflare.com/d1/platform/limits/)。
- 当前导出把多表聚合为一个 SELECT 的 JSON 结果。大数据量可能触及单值/结果容量与 Worker 内存限制，索引不能解决；先测导出字节数。若改分页，必须同时设计快照一致性，不能把“拆成多个 SELECT”误当成无成本优化。
- SQL 备份导入需按 D1 语法和父子顺序验证；不能假设任意 SQLite dump 原样导入成功。[导入导出说明](https://developers.cloudflare.com/d1/best-practices/import-export-data/)。
- 现有 `pnpm -C apps/admin-worker run d1:migrate` 带 `--remote`，不是离线试跑入口；开发配置也有 remote bindings。演练必须用明确隔离的配置、数据库与 bucket。

## 9. 验收矩阵与停止条件

### 9.1 必须通过的验证

```text
维度             验证内容                                      成功标准
数据守恒         作品/角色 ID 集、逐行原字段摘要                完整相等或仅有批准的转换
作者与日期       原字符串、裁决映射、NULL/非法日期分布          无静默归并/补值
关系             FK/唯一性/NULL 检查、孤儿 metadata             0 个未批准异常
图片             required 集合、key、实际下载 hash/size          100% 映射；无误覆盖/误删
历史升级         0001/0002 带数据路径及当前生产版本路径         无作品丢失；序列可继续新增
CRUD             同日多作、未知作者、改名/改日期/换图/删除      身份不变，事务失败无半状态
并发/中断        上传竞态、重跑、超时未知、旧客户端写入          冲突可识别，引用始终可用
公开行为         搜索、时间线、RSS、计数、隐藏/归档、链接        语义等价或差异经过批准
持久状态         旧 interest key、analytics 映射、旧 fragment    有兼容或明确可解释的例外
构建与缓存       新旧 schema、stale HTML、batch URL、revision    不混用协议，不覆盖新发布
恢复             停写恢复、开放写入后前滚、对象保留             演练成功且时间有记录
性能             同 fixture SQL/rows/p50/p95/体积/构建时间      无未解释退化；收益用实测写
```

保留数据库记录数不等于公开行为不变。preview/part 在 RSS、汇总与普通列表的行为不同，需要分别比对；校验总数也不等于 ID 集和内容守恒。

实施验证命令按项目规范串行执行：`mise exec -- pnpm run lint`、`typecheck`、`test`；另用已验证离线 fixture 完成 Astro check、Admin build、Web 静态构建及 Worker 隔离集成测试。不得为跑 build 不慎触发生产导出；不能把本地 Vitest 通过写成真实 D1/R2 或线上浏览器通过。

### 9.2 任一步触发即停止

- 账号/数据库/bucket、迁移记录、代码 SHA、源数据摘要不符合批准的变更包。
- 作品 ID 丢失/重编号、行数意外下降、字段摘要不符、未裁决作者/日期碰撞。
- 必需图片缺失/hash 不匹配、引用无法唯一确定、旧对象已不在恢复保护范围。
- batch/CLI 返回结果不明确、实际影响数不符、超出实测时间预算或剩余空间不足。
- 旧应用/自动化仍在写入、旧构建仍可部署、恢复演练失败。

停止后保存当前 schema/计数/journal/错误日志，按阶段选择前滚或恢复；不盲目重新执行整个迁移，不临时放宽约束让数据“过关”。

## 10. 工作量、维护窗口与成本

以下是单名熟悉项目工程师的**规划区间**，不是按代码行数推算的承诺；假设数据量可完整盘点、没有大批人工歧义、能安排短暂停写、没有新增多作者/多角色需求。

```text
工作包                              预计投入
G0 环境盘点、基线、业务规则          1-2 人日
A/B 索引、迁移门禁、查询收口         1-2 人日
C 映射与异常报告                    1-3 人日（人工裁决等待另计）
D 全链路身份迁移实现                4-7 人日
E 约束/故障/浏览器/恢复演练          2-4 人日
F 切换工具、预检、执行与初验         1-2 人日
合计                                10-20 人日，另预留 20%-30% 缓冲
G 观察与清退                        观察期另计；执行约 0.5-1 人日
```

若只做索引与 schema 治理，先按约 2-4 人日安排；完整结构迁移不可压成“改一天数据库”。远端导入导出、人工作者判定、特殊旧链接、历史损失恢复可能成为关键路径。并行阅读/测试设计可缩短等待，但同一 schema 的迁移和生产切换必须串行管理。

维护窗口不凭作品数量估计：`最终盘点 + 备份 + 回填 + 全量校验 + 后台部署 + 固定快照构建 + Web 部署 + 冒烟 + 回退余量`，按副本实测取保守值。提前完成依赖安装、静态代码检查和隔离演练，可缩短窗口。只有证明旧 Web 仍可服务且后台停写门禁有效，才能说“主要影响后台编辑”。

成本记录：D1 读写行数、加索引与临时表空间、R2 GET/PUT/LIST 次数及备份存储、下载总字节、CI 时间、人工裁决时间。默认不重写图片可避免不必要的对象写入；是否收费及额度按实际账号/当日价目核验，本计划不编造金额或节省比例。

## 11. 实施时预期涉及的文件与职责

- `apps/admin-worker/migrations/`：新增前向迁移、独立索引与最终约束，不回改已应用历史文件。
- `apps/admin-worker/scripts/`：受控盘点/映射/回填/验证入口，默认 dry-run，真实写入显式指定目标；实际文件名在实施时定稿。
- `apps/admin-worker/src/adminPersistence.ts`：ID 关联、事务写入、schema 真值收口和必要的并发判定。
- `apps/admin-worker/src/adminApi.ts`、`adminData.ts`、`adminSourceImages.ts`：新字段契约、读模型、图片对象生命周期。
- `packages/domain/src/`：作品/作者/日期类型、验证、schemaVersion、manifest 与搜索元数据。
- `apps/admin/src/`：日期和作者独立输入、ID 图片操作、旧客户端/冲突提示。
- `apps/admin-worker/scripts/exportWebFactSource.ts`：ID、显式字段、兼容映射和固定快照校验。
- `apps/web/src/`：图片 registry、列表/时间线/搜索/RSS/汇总、fragment resolver、兴趣状态。
- `apps/web/data/generatedFactSource.ts`、`commissionRecords.ts`：构建输入运行时校验和作品记录适配，拒绝旧协议与混合 revision。
- `.github/workflows/`：schema 预检、切换时发布控制、只读固定快照部署。
- 对应测试、`docs/api-reference.md`、`docs/ai-agent-guide.md` 与各层 AGENTS：契约、行为与验证证据同步。

本次实际仅新增本文、更新根 AGENTS 的文档索引/迁移护栏及 `tasks/todo.md`；以上业务文件是后续实施范围，没有在本次修改。

## 12. 放行清单

- [ ] 最新基线固定，相关整改已收口；实际目标和 migration 历史已核实。
- [ ] 0003 带数据路径风险有处置，所有支持的升级路径通过守恒验证。
- [ ] 索引方案和查询基线已复核；不存在以性能理由强行扩大模型迁移。
- [ ] 日期、作者、preview/part、旧链接、兴趣状态和恢复窗口均有决策记录。
- [ ] 全量映射/例外完成；无静默数据损失或隐私信息进入公开兼容表。
- [ ] SQLite、隔离 D1/R2、真实浏览器与恢复演练完成，证据可回放。
- [ ] 生产变更包给出确切 SQL/脚本、环境、数量、时间预算及停止条件。
- [ ] 停写、发布锁、旧客户端门禁、备份、对象保留和恢复材料已验证。
- [ ] 在对应执行授权下完成切换；新写入开放时刻和不可逆边界有记录。
- [ ] 观察期通过后，旧列/表/对象分别评审清退；更新最终架构与 API 文档。

**当前建议的下一步：先做 G0 和索引/迁移安全工作包，把真实环境与数据映射摸清，再批准完整身份迁移的模型和窗口。** 保持 D1/R2 与 Astro 主架构，解决身份耦合，不借此重写整个站点。

## 附录：带数据升级的最小复现

以下脚本在仓库根目录运行，仅使用内存 SQLite、读取本地 migration，不连接 D1/R2。它用于复现历史风险，不是修复脚本；预期两个分支均出现作品数从 1 变成 0。

```python
from pathlib import Path
import sqlite3

files = sorted(Path('apps/admin-worker/migrations').glob('*.sql'))
for deferred in (False, True):
    db = sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys=ON')
    for file in files[:2]:
        db.executescript(file.read_text())
    db.execute("INSERT INTO characters VALUES(1,'example','stale',1)")
    db.execute(
        "INSERT INTO commissions "
        "VALUES(1,1,'20260101_artist','[]',NULL,NULL,0,NULL)"
    )
    db.execute(
        "INSERT INTO source_images "
        "VALUES('20260101_artist','key.jpg','image/jpeg',10,?,CURRENT_TIMESTAMP)",
        ('a' * 64,),
    )
    db.commit()
    db.execute('BEGIN')
    db.execute('PRAGMA defer_foreign_keys=' + ('ON' if deferred else 'OFF'))
    for statement in files[2].read_text().split(';'):
        if statement.strip():
            db.execute(statement)
    db.commit()
    print(deferred, {
        table: db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
        for table in ('characters', 'commissions', 'source_images')
    }, db.execute('PRAGMA foreign_key_check').fetchall())
print(sqlite3.sqlite_version)
```

本次两组实测均为 `characters=1, commissions=0, source_images=1, foreign_key_check=[]`；SQLite 版本 `3.53.4`。脚本按当前三份文件排列构造，未来新增迁移后应显式指定历史文件而非将其作为通用迁移执行器。
