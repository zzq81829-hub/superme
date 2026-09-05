# Superme 小红书经营闭环建设计划

日期：2026-09-03  
对象：社科书籍号（第一实验账号）  
目标：让 AI 的第 5 轮内容决策明显优于第 1 轮，而不是增加 Agent 数量。

## 一、结论

Superme 当前不是从零开始，已经处于 **Level 2.5**：

- Content OS v1.0、30 秒停留法则、7 角色对抗编辑部已经写入公司标准；
- Worker 派工会读取 AGENTS、Founder Brief、项目文件和马尾辫规则；
- 内容三层、冻结包、审批、xhs-mcp 发布通道已经存在；
- 记忆候选、确认、版本替换和权限治理已经存在；
- 但还没有“发布前实验档案 → 发布后真实数据 → 漏斗诊断 → 假设 → Strategy Memory 候选”的机器闭环。

因此现在最重要的不是继续写标准，也不是部署更多 Agent，而是补齐数据回流和复盘闭环。

## 二、现在不写代码就能做什么

### A. 立即跑第一轮内容实验

只用社科书籍号，只选 1 本书：

1. 从原文提取 20 个 Insight；
2. 按 Traffic / Click / Read / Save / Discussion / Share / Follow / Fit / Evidence 九维评分；
3. Chief Editor 只保留 TOP 3；
4. 每个 Insight 生成 1 篇 6 页图文；
5. Critic、Fact Checker、XHS Editor 做对抗质检；
6. 生成 3 个冻结发布包，停在 Founder 审批；
7. Founder 批准后才发布；
8. 先用人工方式记录真实数据，等待 P0 数据入口完成。

### B. 已经可以直接使用的公司能力

- 公司级内容宪法：`founder_os/CONTENT_OPERATING_SYSTEM.md`
- 书斋执行标准：`founder_os/projects/SHUZHAI.md`
- 创始人审美与文案规则：`founder_os/BRIEF.md`
- 内容发布包：`data/content/packages/`
- 发布审批与 xhs-mcp 通道：Founder OS 内容包面板
- Founder Memory 候选确认与版本替换
- Worker 任务路由、验收、一次自动返工、评论反馈

### C. 现在必须人工保留的一步

发布后把下列数据录回系统：

- 曝光
- 阅读/观看
- 平均停留或完读（平台能提供哪个就填哪个）
- 点赞
- 收藏
- 评论
- 分享
- 主页访问
- 新增关注

这一步在 P0 完成前可以临时记入同一张实验表，不需要 Founder 自己分析。

## 三、成熟度与缺口

| 等级 | 状态 | 说明 |
|---|---|---|
| Level 1：AI 找、AI 拆、人选 | 已具备 | 标准和 Worker 能力已有 |
| Level 2：AI 选、AI 写、人审核 | 已具备 | 内容包与反馈闭环已有 |
| Level 3：AI QC、人批准 | 部分具备 | 审批已具备；7 角色流程主要靠规则约束，尚无结构化 QC 记录 |
| Level 4：数据回流、AI 复盘、策略学习 | 未具备 | 当前最大缺口 |
| Level 5：Founder 只看 CEO Brief | 暂不建设 | 必须先证明 3–5 个真实循环有效 |

## 四、哪些必须修改 OS 代码：开发优先级

## P0｜必须先完成：真实数据闭环

### P0-1 内容实验档案与数据接口

需要写 OS 代码。

每个发布包新增两类数据：

**发布前 Experiment Snapshot**

- accountId、source、insight、audience、painOrDesire、objective
- topic、title、hookType、emotion、contentStructure、cta
- 九维预测分
- recommendation、risks、strategyVersion、hypothesisIds

**发布后 Metrics**

- capturedAt
- impressions、reads、avgStaySeconds/readCompletion
- likes、saves、comments、shares、profileVisits、followersGained
- 自动计算 clickRate、saveRate、engagementRate、followRate

约束：

- Experiment Snapshot 在冻结时锁定；
- Metrics 是发布后运营数据，更新它不能撤销发布审批或改变内容哈希；
- 所有数值必须非负；缺失值允许为空；除零必须安全；
- Worker 仍不能绕过 Founder 审批发布。

### P0-2 Founder OS 手工录数界面

需要写 OS 代码，依赖 P0-1 的接口先定稿。

在已发布内容包卡片上增加：

- 「录入数据」按钮；
- 九项真实数据输入；
- 自动显示关键比率；
- 显示“已录入 / 待补数据”；
- 手机端可用；
- 不要求 Founder 写分析文字。

### P0-3 第一轮真实试验

不需要等代码全部完成，可以与 P0-1 并行。

交付：1 本书、20 个 Insight、TOP 3、3 个发布包、每篇完整预测和推荐理由。禁止直接发布，停在审批队列。

## P1｜P0 有真实数据后：诊断与学习

### P1-1 漏斗诊断器

需要写 OS 代码。

先用确定性规则，不调用新模型：

- 曝光低：选题/标签/初始匹配问题；
- 曝光高、点击低：封面/标题/包装问题；
- 点击高、阅读低：Hook 成功、正文失败；
- 阅读高、收藏低：有趣但缺少长期价值；
- 收藏高、关注低：单篇有价值，账号承诺不足；
- 数据不错、关注低：主页定位或内容一致性问题。

禁止写死全平台万能阈值。优先与该账号最近 10 篇、30 篇的中位数比较；样本不足时只记录，不下强结论。

### P1-2 Hypothesis 候选与 Strategy Memory

需要写 OS 代码，但复用现有 Memory Ledger。

- 单篇结果只能生成 Hypothesis，不得直接成为 Strategy；
- 每条假设保存证据、反证、样本数、适用账号、状态和趋势；
- 默认至少 3 个可比实验才允许升为 Strategy Memory 候选；
- 只能进入“候选卡”，不得自动确认；
- Founder 确认后才成为 active memory；
- 允许 HIGH → MEDIUM → TESTING → REJECTED。

### P1-3 每日运营 Brief

需要写 OS 代码。

只输出：昨天发生了什么、为什么、学到了什么、今天测什么、风险、需要 Founder 决策数。没有战略或风险问题时固定显示：`需要 Founder 决策：0`。

## P2｜完成 3–5 个循环后再做

- CSV/截图 OCR 批量导入数据；
- 每周 7 天/30 天策略版本报告；
- Content Memory 重复题材/标题检测；
- Audience Memory 聚类；
- 自动排期和库存看板；
- X 信息号与 Founder 个人号接入。

## P3｜现在不要做

- 依赖未验证官方接口的全自动数据抓取；
- 为四个逻辑角色部署十几个真实 Agent；
- 训练或微调模型；
- 一次性自动化三个账号；
- 根据一篇爆款静默修改公司策略；
- 没有真实数据前做复杂预测模型；
- 绕过 Founder 的自动发布、付费或账号定位调整。

## 五、派工顺序

```text
并行开始：P0-1 Codex 后端 + P0-3 Grok/内容团队首轮试验
                    ↓
              P0-2 Antigravity 前端
                    ↓
              Claude 独立审查
                    ↓
              Hermes 集成验收
                    ↓
              Founder 批准并发布 3 篇
                    ↓
              录入真实数据
                    ↓
              再启动 P1 诊断与记忆
```

## 六、可直接复制的派工 Prompt

## Prompt A｜Codex：P0-1 后端实验账本

```text
你负责 Superme 小红书经营闭环的 P0-1 后端，不做前端。

工作目录：C:\Users\22145\Desktop\superme

开始前完整阅读：AGENTS.md、founder_os/FOUNDER_MODEL.md、founder_os/GOVERNANCE.md、founder_os/CURRENT_STATE.md、founder_os/CONTENT_OPERATING_SYSTEM.md、founder_os/projects/SHUZHAI.md，并检查 git status。当前工作树有用户未提交修改，必须保留，禁止清理或覆盖无关文件。全程使用 ponytail：最小完整改动，不加依赖。

目标：为每个小红书内容发布包加入“发布前 Experiment Snapshot”和“发布后 Metrics”，形成可审计的数据基础。

要求：
1. Experiment 至少包含 accountId、source、insight、audience、painOrDesire、objective、topic、title、hookType、emotion、contentStructure、cta、九维预测分、recommendation、risks、strategyVersion、hypothesisIds。
2. Metrics 至少包含 capturedAt、impressions、reads、avgStaySeconds/readCompletion、likes、saves、comments、shares、profileVisits、followersGained，并安全计算 clickRate、saveRate、engagementRate、followRate。
3. Experiment 在冻结时锁定；修改它必须撤销旧审批。
4. Metrics 在发布后追加，不能改变发布内容哈希、不能撤销批准、不能把 published 改回 draft。
5. 数值非负，缺失可空，除零安全。
6. 复用现有 src/content/store.js、server.js 和测试模式；不要重写发布包系统。
7. Worker /send 继续 403；不得扩大外发权限。
8. 提供最小 API，供后续前端录数和读取结果。

机器验收：
- 新建发布包可保存 Experiment；
- freeze 后 Experiment 修改使审批失效；
- published 包追加 Metrics 后仍保持 published 且内容哈希不变；
- 比率计算和非法输入有测试；
- npm test 全部通过。

只交付后端、API 和测试，不修改 public/index.html、public/app.js、public/style.css。
```

## Prompt B｜Antigravity：P0-2 录数与复盘界面

```text
你负责 Superme 小红书经营闭环的 P0-2 前端。必须等 Codex 的 P0-1 API 合并后开始，不修改后端数据模型。

工作目录：C:\Users\22145\Desktop\superme

开始前完整阅读 AGENTS.md、founder_os/CONTENT_OPERATING_SYSTEM.md、founder_os/projects/SHUZHAI.md、docs/SHUZHAI_XIAOHONGSHU_LAYOUT.md，并检查 git status。保留所有用户修改。使用 ponytail，不引入前端框架或新依赖。

目标：Founder 在内容发布包面板里，用不到 2 分钟录入一篇已发布笔记的数据，并直接看到关键比率。

界面要求：
1. 仅对 approved/published/ready_manual 包显示数据区；published 优先。
2. 增加“录入数据”入口，字段：曝光、阅读、停留/完读、点赞、收藏、评论、分享、主页访问、新增关注、采集时间。
3. 保存后显示点击率、收藏率、互动率、关注转化率。
4. 明确显示“待补数据 / 已录入 / 数据不足，暂不归因”。
5. 手机端可以完成输入，不遮挡现有审批与发布按钮。
6. 不改变现有视觉系统，不重做整个 Dashboard。
7. 不增加自动发布，不读取小红书 Cookie，不触碰登录态。

机器验收：
- 使用 mock 数据能完成打开、填写、保存、刷新回显；
- 非负数校验和空值可用；
- 保存失败有明确提示；
- 原有内容包审批/发布 UI 不回归；
- npm test 全部通过。

只修改 public/index.html、public/app.js、public/style.css 及必要的前端测试，不修改 src/content/store.js 和发布权限代码。
```

## Prompt C｜Grok / 内容团队：P0-3 第一轮真实试验

```text
你负责社科书籍号第一轮内容试验，不写 OS 代码、不发布。

工作目录：C:\Users\22145\Desktop\superme

先完整阅读 founder_os/CONTENT_OPERATING_SYSTEM.md、founder_os/BRIEF.md、founder_os/projects/SHUZHAI.md。严格执行 30 秒停留法则、事实护栏、去 AI 腔和 7 角色对抗编辑部。

任务：只选 1 本已有可靠原文或书摘的书，完成：
1. Researcher 提供来源锚点；
2. Insight Miner 提取 20 个互不重复的 Insight；
3. Audience Psychologist 写清每个 Insight 对应的人、痛点/恐惧/渴望；
4. Growth Editor 为每个候选设计不同传播目的，不生成 20 个同义标题；
5. Fact Checker 检查原材料是否支持标题；
6. 九维评分并保留 TOP 5 给 Chief Editor；
7. Chief Editor 最终选 TOP 3；
8. Creator 把 TOP 3 各做成一篇 6 页图文完整方案，记录发布前预测、推荐理由、风险和待验证假设；
9. 创建 3 个本地内容包并停在 awaiting_approval，绝不点击批准或发布。

交付：20 个 Insight 表、TOP 5 主编板、TOP 3 完整发布包、每篇 Experiment Snapshot。不得编造书中原句、章节、页码或研究数据。

硬性边界：不得发布；不得替 Founder 批准；不得把草稿伪装成已发布结果。
```

## Prompt D｜Claude：独立对抗审查

```text
你是 Superme 小红书经营闭环的独立审查员。只审查，不直接重构，不发布。

审查对象：Codex 的 P0-1 后端改动、Antigravity 的 P0-2 前端改动、3 个首轮内容包。

必须核对：
1. Metrics 更新是否错误地改变内容哈希或撤销 published 状态；
2. Experiment 是否在冻结后仍可被静默修改；
3. 是否存在负数、除零、空值、重复提交、旧数据迁移问题；
4. 是否扩大了 Worker 发布权限或绕过 Founder 审批；
5. 前端是否在手机端可录数，是否破坏原审批按钮；
6. 内容标题是否超出来源证据；
7. 是否出现 AI 腔、正确废话、模糊悬念或“标题比正文大”；
8. 三篇是否只是同一观点换标题；
9. 是否真的记录了 Prediction，而不是发布后倒填理由。

输出按 P0/P1/P2 排序，给精确文件与行号。无阻断问题时明确写 PASS；不要为了显得认真制造无关建议。
```

## Prompt E｜Hermes：集成验收与首轮闭环

```text
你是 Superme COO，负责集成验收，不重新设计系统。

前置：Codex P0-1、Antigravity P0-2、Claude 审查已完成。

按真实路径验收：
1. 创建带 Experiment 的小红书发布包；
2. 冻结、批准流程不被破坏；
3. 未登录时保持 approved，不假装发布成功；
4. mock 或已批准测试包发布后保持 published；
5. 在桌面和手机布局录入 Metrics；
6. 刷新后数据仍在；
7. 比率计算正确；
8. Metrics 不改变内容哈希；
9. Worker /send 仍返回 403；
10. npm test 全部通过。

输出 Founder 可读报告：现在能用什么、哪些路径已验证、哪些仍需真实账号数据、验收是否通过、唯一下一步。发现失败先退回对应 Worker，不要自己扩建新模块。
```

## 七、第一阶段验收标准

必须完成 3–5 个真实循环后再判断：

1. 每篇都有发布前预测与真实数据；
2. AI 能指出失败发生在曝光、点击、阅读、收藏还是关注环节；
3. 至少形成 3 条有证据的 Hypothesis；
4. 至少一条旧假设被数据否定或降级；
5. 第 5 轮 TOP 3 的选择理由比第 1 轮更贴近真实高收藏/高关注内容；
6. Founder 每轮只做品味选择和发布审批，不自己写分析。

未达到以上标准：继续跑闭环，不增加账号，不增加 Agent，不做自动抓数。
