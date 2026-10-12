# 全仓审计（2026-10-12）

五个只读子代理分区审计（worker+domain / web 运行时 / web 构建与 SEO / admin SPA / CI 与测试），主会话抽查了标
「已核」的条目。行号对应 `c900cae`，会漂移；动手前重新核对。已关闭项与 `open-issues.md`「已核实不是缺陷」未重复列出。

严重度：H 会让用户看到错误结果或泄露隐私；M 可复现的功能/性能缺陷；L 打磨。

## 0. 隐私：站点 → 仓库 → 身份的关联（已核，owner 决定）

- **PRIV-1（H，已核）**：仓库是 PUBLIC；`https://crystallize.cc/build-info.json` 公开完整 `codeSha`
  （`apps/web/src/pages/build-info.json.ts:7`）。在 GitHub commit 搜索 `hash:<sha>` 直接命中
  `aozaki-kuro/commission-index`。截短 SHA 无效，已核：8 位前缀同样能搜到。
- **PRIV-2（H，owner）**：即使去掉 `codeSha`，公开仓库的源码里仍有 `crystallize.cc`、`@CrystallizeSub`、
  `dmca@crystallize.cc`，代码搜索就能把站点关联到仓库；commit 历史里也有作者邮箱。只有仓库
  转私有（或拆出不含站点标识的公开镜像）才能真正断开关联。这属于 owner 决定，代码改动无法解决。
- admin 的发布确认只读 `dataExportedAt`（`apps/admin/src/lib/liveBuildInfo.ts:58-63`），不读 `codeSha`。
  `codeSha` 恒为 `null` 是安全的；但**直接删掉这个键**会让 `parseBuildInfo`（`:37`）抛错，发布确认将永远超时。
- 构建号可以用 `GITHUB_RUN_NUMBER`（每个 workflow 一个计数器，`CI` 与 `Rebuild Web` 互相独立），也可以用
  `dataRevision` 前缀。两者都不指向 commit。

## 1. web 公共站点运行时

| ID     | 严重度    | 位置                                                                                                           | 问题                                                                                                                                                                                                                                                                                                 |
| ------ | --------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WEB-1  | H（已核） | `features/home/commission/batch/homeCharacterBatchManifest.ts:10,24`、`homeTimelineBatchManifest.ts:7,21`      | manifest 以 `WeakMap<Document>` 缓存，只在测试里清空。ClientRouter 软导航切换语言（如 zh-tw → ja）后，同一个 `document` 仍命中旧 manifest，后续批次按旧语言、旧 `batchVersions` 拉取。批次按语言分目录（`dist/search/home-character-batches/{en,ja,zh-tw}`）。搜索索引只有一份、不分语言，不受影响。 |
| WEB-2  | H（已核） | `loader/activeCharactersLoader.ts:205-219`；archived `:206-220`、timeline `:164-176` 同构                      | 循环中途 `await` 失败时，已挂载批次的计数没有写回 `updateLoadedState`；重试或下一次搜索会从 0 重新挂载，产生重复 section 和重复 id。timeline 不派发失败事件，静默卡住。                                                                                                                              |
| WEB-3  | M         | `homeCharacterBatchClient.ts:185` + `batchRequestQueue.ts:29-32`                                               | idle 预取不走“404 → 重读 manifest”回退，正式请求又复用了预取的 rejected promise。部署后打开旧 HTML 时，首次加载必然失败。                                                                                                                                                                            |
| WEB-4  | M         | `homePageClient.ts:122-130`；`unpublishedInterestClient.ts:108`                                                | 任何一个延迟挂载抛错都会拆掉整页运行时；`localStorage` 未加防护，存储被禁用时会抛 SecurityError。年龄门 `AgeGateScript.astro` 同样未防护。                                                                                                                                                           |
| WEB-5  | M         | `commission/viewModeState.ts:31`、`search/commissionSearchController.ts:79`、`lib/navigation/hashAnchor.ts:67` | `history.replaceState(null, …)` 抹掉 ClientRouter 的 `{index, scrollX, scrollY}`，后退/前进可能丢失滚动或跳过 swap。待浏览器实测。                                                                                                                                                                   |
| WEB-6  | M         | `homeCharacterBatchClient.ts:63`                                                                               | 批次 fetch 没有超时；loader 是串行队列，一个挂起的请求会冻结所有后续加载。                                                                                                                                                                                                                           |
| WEB-7  | M         | `commissionSearchController.ts:863-868, 443, 548, 605`；`activeCharactersLoader.ts:169-170, 258-260`           | teardown 后仍有工作在跑：未跟踪的 rAF/timer、entries promise 的 `.then`；loader 的在途队列会重新挂监听并把 LOADED 事件派发进下一次挂载。                                                                                                                                                             |
| WEB-8  | M-L       | `search/commissionSearchKeyboard.ts:67-72, 92-95`                                                              | 面板关闭后 `activeIndex` 不复位，Enter 被吞掉，`aria-activedescendant` 悬空。                                                                                                                                                                                                                        |
| WEB-9  | M-L       | `nav/sidebarNavEnhancer.ts:646-656, 716-720`；`mobileHamburgerMenu.ts:571-615`                                 | Ctrl/Cmd/Shift 点击被 `preventDefault`，无法在新标签打开。                                                                                                                                                                                                                                           |
| WEB-10 | M-L       | `mobileHamburgerMenu.ts:268-272, 356-370, 397-408`                                                             | 打开/关闭不管理焦点，没有 `inert`；搜索按钮在 pointerdown 时触发，触摸滚动会误触。                                                                                                                                                                                                                   |
| WEB-11 | L-M       | `commissionSearchController.ts:262-265, 434`                                                                   | 输入后 `?q=` 不更新，`popstate` 被忽略；刷新或分享得到的是旧查询。                                                                                                                                                                                                                                   |
| WEB-12 | L-M       | `commissionSearchController.ts:863`                                                                            | 每次访问都在 idle 时拉取完整搜索索引（约 49 KB），可推迟到首次交互或有 `?q=` 时。                                                                                                                                                                                                                    |
| WEB-13 | L         | `commissionSearchController.ts:605`                                                                            | `requestAnimationFrame(recompute)` 不去重，同一帧会重复计算。                                                                                                                                                                                                                                        |
| WEB-14 | L         | `commission/scrollReveal.ts:55, 132-135`                                                                       | 在 body 上挂全局 MutationObserver（subtree + class），搜索过滤时被大量触发；IntersectionObserver 不触发的场景（如打印）下条目保持 `opacity:0`。                                                                                                                                                      |

## 2. web 构建 / SEO / a11y

| ID    | 严重度    | 位置                                                             | 问题                                                                                                                                                                       |
| ----- | --------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BLD-1 | M（假设） | `features/home/server/batchPayloadBuilder.ts:8,10,30`            | 图片宽度阶梯只有 768/1280（延迟批次 768/960/1280），手机 DPR3 会选 1280w（86 KB，768w 为 42 KB）。可能就是 HANDOFF 里 ~305 kB ImageDelivery 的来源，需先用 Lighthouse 量。 |
| BLD-2 | L-M       | `lib/rssFeed.ts:23`                                              | RSS `<author>` 只放了名字，RSS 2.0 要求邮箱；应改用 `dc:creator`。                                                                                                         |
| BLD-3 | L         | `lib/rssItem.ts:20`；`public/_headers`                           | item 链接缺根路径的 `/`（`crystallize.cc#…`）；`/rss.xml` 线上返回 `application/xml`。                                                                                     |
| BLD-4 | L-M       | `warning/AgeGateScript.astro:16`；`pages/HomePage.astro:160-165` | 年龄门首帧可见时仍是 `aria-hidden="true"`，背景内容也没有 inert。                                                                                                          |
| BLD-5 | L         | `pages/HomePage.astro:227`、`blocks/Footer.astro:13, 28-42`      | id 含空格或连串短横线；没有 `<footer>` 地标；`<small>` 内嵌 `<div>`，HTML 不合法。                                                                                         |
| BLD-6 | L         | `CommissionEntries.astro:58`                                     | 所有图片的 alt 都是版权字符串，读屏会重复读几十次 “©”。                                                                                                                    |
| BLD-7 | L         | `public/favicon/browserconfig.xml`、`site.webmanifest`           | tile 路径线上 404；颜色与品牌色不一致；`start_url` 写成了绝对地址。                                                                                                        |
| BLD-8 | L         | `blocks/Footer.astro:10`                                         | 年份在构建时固定，跨年后要等下一次发布才更新。                                                                                                                             |

## 3. admin SPA

| ID     | 严重度    | 位置                                                                         | 问题                                                                                                        |
| ------ | --------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ADM-1  | M-H       | `components/edit/CommissionEditDrawer.tsx:50-53`                             | 关闭抽屉（Esc、遮罩、切换到另一条结果）直接丢弃未保存的编辑，没有脏检查。                                   |
| ADM-2  | M         | `lib/websiteRebuild.ts:75`                                                   | 轮询 `fetchLiveBuildInfo()` 不传 signal、没有超时；请求挂起时 `inFlight` 不释放，发布按钮会锁死到刷新页面。 |
| ADM-3  | M（perf） | `pages/AdminEditPage.tsx:161-164`                                            | 本地每次保存都触发全量重取（bootstrap + N 个角色组），LOGIC-02 的 scope 只用在跨标签广播上。                |
| ADM-4  | L-M       | `hooks/useCommissionManager.ts:98-111`                                       | 排序保存 v1 成功、v2 失败时，v1 既不 `markPendingRebuild` 也不广播。                                        |
| ADM-5  | L-M       | `hooks/useCommissionManager.ts:524-527`；`SortableCharacterCard.tsx:153-156` | 重命名按 Enter 后再 blur，会发出两次 PATCH。                                                                |
| ADM-6  | L-M       | `hooks/useCommissionManager.ts:590`                                          | 删除角色绕过共享的角色写队列，可能与在途的排序/重命名竞争。                                                 |
| ADM-7  | L-M       | `SortableCharacterCard.tsx:253, 298`                                         | 键盘移到顶/底后，聚焦中的按钮被 `disabled`，焦点丢失；没有 aria-live 通告。                                 |
| ADM-8  | L         | `lib/adminActions.ts:167-171`                                                | `partNumber` 为 NaN 时序列化成 `null`，part 被静默变成独立作品。                                            |
| ADM-9  | L         | `lib/imageCrop.ts:334-385`；`ImageCropDialog.tsx:51`                         | 大图在主线程解码且没有尺寸上限；StrictMode 下 object URL 泄漏（仅 dev）。                                   |
| ADM-10 | L         | `CommissionThumbnailGrid.tsx:96-104`                                         | 缩略图重试一次失败后永久显示 “not found”。                                                                  |
| ADM-11 | L         | `lib/liveBuildInfo.ts:53, 58-63`                                             | 30 s 容差可能把上一次构建误判为本次发布已确认。                                                             |

## 4. admin-worker + domain

| ID     | 严重度               | 位置                                                                                  | 问题                                                                                                                                     |
| ------ | -------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| WRK-1  | M（已核）            | `adminPersistence.ts:338-342`；`character_aliases.character_name` 是主键（迁移 0001） | 重命名角色不同步别名行；别名搜索失效，admin 里出现计数为 0 的孤儿行。                                                                    |
| WRK-2  | M                    | `adminSourceImages.ts:51-71, 138-157`；`adminApi.ts:293-304`                          | 上传只信任 MIME 和扩展名，不做 magic bytes 检查，也没有大小上限；伪装成 jpg 的 WebP/HEIC 会卡死下一次发布构建。                          |
| WRK-3  | M（待 owner 核）     | `adminApi.ts:306-309`；`index.ts:92-94`                                               | 非 GET 请求没有 Origin / Content-Type 检查，`text/plain` 或 multipart 的跨站请求不触发预检。是否可利用取决于 Access cookie 的 SameSite。 |
| WRK-4  | L-M                  | `adminApi.ts:433-446`                                                                 | 先写 R2、后校验角色是否存在；角色不存在时每次失败都留下一个孤儿对象。                                                                    |
| WRK-5  | L-M（已核）          | `packages/domain/src/search.ts:80, 649-651`；`adminData.ts:128, 234-236`              | `\((preview\|part).*?\)$` 会误删 “(Party dress)”、“(Partial)” 这类后缀。                                                                 |
| WRK-6  | L-M                  | `scripts/exportWebFactSource.ts:143, 761-763`                                         | “缺失”判定的正则包含 `404`，而 key 里的 sha/uuid 可能恰好含 “404”，瞬时错误因此不重试。                                                  |
| WRK-7  | L                    | `search.ts:640-647`                                                                   | 引号内的 `!`、`\|` 也被改写，`"k-on! movie"` 无法按短语匹配。                                                                            |
| WRK-8  | L（现在）/ M（以后） | `adminPersistence.ts:385-389`                                                         | 排序 UPDATE 用 3n+1 个绑定参数；D1 单条语句上限 100，同一状态组超过约 33 个角色时排序会失败。sqlite 测试不强制这个上限。                 |
| WRK-9  | L                    | `index.ts:92-94`；`adminApi.ts:543…647`                                               | JSON 格式错误时抛出 1101 HTML，响应不带 CORS 头。`ai-agent-guide.md:72` 有记录，但一直没修。                                             |
| WRK-10 | L                    | `adminApi.ts:164-169`                                                                 | `links` 不校验协议，`javascript:` 会原样写进 `href`。                                                                                    |
| WRK-11 | L                    | `adminData.ts:532-535`                                                                | 别名 key 冲突时，计数被覆盖而不是相加。                                                                                                  |
| WRK-12 | L                    | `exportWebFactSource.ts:603` vs `:662`                                                | 复用文件与新下载文件的 `mimeType` 来源不同，revision 可能随缓存状态变化。                                                                |
| WRK-13 | L                    | `adminApi.ts:488-495`；`adminPersistence.ts:689-723`                                  | 换图过程中作品被删除，会写入 `commission_id = NULL` 的 `source_images` 行。                                                              |
| WRK-14 | L（潜在）            | `exportWebFactSource.ts:202-206`                                                      | `spawnSync` 使用默认 1 MiB maxBuffer，超出后报错信息为空。                                                                               |

存疑、暂不处理：四位数字一律按年份改写（`dateSearch.ts:57-60`），可能是有意设计。

## 5. CI / 配置 / 测试

| ID    | 严重度            | 位置                                                                             | 问题                                                                                                                           |
| ----- | ----------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| CI-1  | H（owner 设置）   | `deploy-web-snapshot/action.yml:82-83, 112-113`；`ci.yml:92-93`                  | 一个全权限 Cloudflare token 是仓库级 secret；没有 job 使用 `environment:`，整条构建工具链都能拿到它，Renovate 还会 automerge。 |
| CI-2  | M                 | `.github/actions/setup/action.yml:12,17` 等                                      | 第三方 action 按 tag 固定，没有 pin SHA。                                                                                      |
| CI-3  | M                 | `ci.yml:30-53`                                                                   | PR 不跑 `astro build`，构建坏了要合入后、部署时才发现。                                                                        |
| CI-4  | M                 | `apps/web/server/assetsPipelineAstro.ts:36-50`                                   | Hidden 原图防泄漏只靠一个 Vite 插件，没有任何测试或构建断言。                                                                  |
| CI-5  | M-L               | `deploy-web-snapshot/action.yml:31-37`                                           | 判定过期的 rebuild 直接 `exit 0`，如果更新的 master 部署失败，数据改动就永远不会发布。                                         |
| CI-6  | M-L               | `ci.yml`、`rebuild.yml`                                                          | 所有 job 都没有 `timeout-minutes`；发布锁可能被占用 6 小时。                                                                   |
| CI-7  | M-L               | （缺失）                                                                         | 部署后没有冒烟检查：`/admin` 404、`build-info.json` 的 revision 与导出一致。                                                   |
| CI-8  | L-M               | `deploy-web-snapshot/action.yml:94-101`                                          | 每个内容 revision 都保存一份完整的源图缓存，可能把 pnpm 缓存挤出 10 GB 上限。                                                  |
| CI-9  | L-M（owner 设置） | 仓库设置                                                                         | 公开仓库没有开启 secret scanning 和 push protection。                                                                          |
| CI-10 | L                 | `config/*.ts`、`scripts/`、`apps/admin/playwright.ui.config.ts`                  | 这些文件不在任何 typecheck 范围内。                                                                                            |
| CI-11 | L-M               | `apps/admin-worker/scripts/listR2Orphans.ts` 等；`config/vitest.config.ts:22-25` | 会删除或写入数据的脚本没有测试，vitest 也不收集 `apps/*/scripts/**`。                                                          |
| CI-12 | L                 | `.github/renovate.json:76`                                                       | `matchPackagePrefixes` 已弃用。                                                                                                |
| CI-13 | L                 | `deploy-web-snapshot/action.yml:49-53`                                           | `--paginate \| grep -q` 遇到 pipefail 时可能误判，但会安全失败。                                                               |

## 6. 功能建议（各区汇总）

- **页脚构建号**（owner 提出）：显示 `#<run_number> · <YYYY-MM-DD>`，或 `dataRevision` 前 8 位，不暴露 commit。
- **实时可分享的搜索 URL**：输入时用 `replaceState` 同步 `?q=`，并处理 `popstate`（对应 WEB-11）。
- **archived / timeline 的内联重试**：复用 active 区已有的失败反馈 UI。
- **admin 未保存修改守卫与 dirty 标记**（对应 ADM-1）。
- **部署后冒烟检查**（对应 CI-7）。
- **作品级 alt 文本**（对应 BLD-6）：需要改 schema、admin 和导出，体量中等。
- **分语言的 RSS**：`/ja/rss.xml`、`/zh-tw/rss.xml`。
- **点击卡片元数据即搜索**：点创作者或关键词时填入搜索框。

## 7. 落地顺序

已成文计划（每份一个 PR）：

- **A** `superpowers/plans/2026-10-12-build-info-privacy.md`：PRIV-1 和页脚构建号。优先做。
- **B** `superpowers/plans/2026-10-12-web-runtime-fixes.md`：WEB-1、WEB-2、WEB-3、WEB-6、WEB-4。

待成文计划（动手前另写，并重新核对行号）：

- **C worker**：WRK-1（重命名时在同一 batch 里迁移别名）、WRK-5（正则收紧为 `\((preview|part \d+)\)$`）、
  WRK-9（`index.ts` 统一 catch，返回 JSON 400）、WRK-2（magic bytes 校验和大小上限）、WRK-4（先校验、后写 R2）、
  WRK-8（排序分批）、WRK-10（links 只允许 http/https）。
- **D CI**：CI-3（PR 上用 fixture 跑 `astro build`，同时对 `dist` 做 40-hex / 仓库名的泄漏 grep）、CI-4（断言 Hidden
  原图不进 `dist`）、CI-6（timeout-minutes）、CI-7（部署后冒烟检查）、CI-2（Renovate `helpers:pinGitHubActionDigests`）、
  CI-5（过期 rebuild 不再静默 `exit 0`）。
- **E admin**：ADM-1（未保存修改守卫）、ADM-2（轮询超时）、ADM-3（本地保存按 scope 刷新）、ADM-4、ADM-5、ADM-6。
- **先验证、后修**：WEB-5（需要浏览器复现，复现不了就丢弃）、BLD-1（先量 Lighthouse ImageDelivery，再决定阶梯）、
  WRK-3（Origin 白名单必须放行本地 `dev:admin` 的 4174 → 8787；是否真能利用，取决于 owner 核实 Access cookie 的
  SameSite）。
- 其余 L 级条目合并成一个打磨 PR，或按需处理。

## 8. 防盗链 / 外链（owner 追加问题，未成文计划）

现状：前台只拦截右键（`commissionImageNoticeClient.ts:111`），弹提示，作为社交层面的威慑。公开图片全部是
`/_astro/*.webp`（最大 1280w，原图不进 dist），`_headers` 对这些文件只设了 immutable 缓存。

| 方案                                                                     | 能挡住什么                                    | 挡不住什么                                              | 成本 / 归属                                                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `_headers` 对 `/_astro/*` 加 `Cross-Origin-Resource-Policy: same-site`   | 其他站点用 `<img>` 直接嵌入（浏览器拒绝加载） | 直接打开 URL、下载、爬虫、截图                          | 一行配置，可回滚；`same-site` 仍放行 `admin.` 子域；社交卡片抓取在服务端进行，不受影响                              |
| Cloudflare WAF 自定义规则：`/_astro/` 且 Referer 非空、又不是本站 → 拦截 | 嵌入，以及从外站点进来的跳转                  | 空 Referer 必须放行（直接访问、隐私插件），爬虫照样能抓 | 免费版 5 条规则之一；dashboard 配置，属 owner 操作。Cloudflare 自带的 Hotlink Protection 不覆盖 `.webp`，这里用不上 |
| 构建时给公开衍生图加可见水印（sharp）                                    | 转载后溯源，实际威慑最强                      | 裁剪、修图                                              | 改变作品外观，需 owner 决定；只作用于公开衍生图                                                                     |
| 前台改成 admin 那种流式 / blob / canvas 渲染                             | 右键另存                                      | 截图、devtools                                          | 牺牲 CDN 缓存和 LCP，基本没有收益，不推荐                                                                           |
