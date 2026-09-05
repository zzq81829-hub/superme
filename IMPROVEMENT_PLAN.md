# IMPROVEMENT_PLAN.md

> **性质**：架构审计 + 最小改进方案。本轮不改代码、不施工。  
> **审计时间**：2026-09-03  
> **审计人**：Grok Build（架构 / 审计）  
> **项目**：`C:\Users\22145\Desktop\superme`  
> **原则**：文档里的计划 ≠ 已实现。状态只允许 `IMPLEMENTED` / `PARTIAL` / `PLANNED` / `BROKEN` / `UNKNOWN`。  
> **本机验证**：`npm test` **151/151 PASS**（文档里写的 116 或 138 均过时）。`GET http://127.0.0.1:3210/api/health` **200，服务在跑，`dryRun=false`**。

---

## 0. 审计口径与文档纠错

下面这些说法**不能当事实**：

| 文档说法 | 真实状态 | 证据 |
| :--- | :--- | :--- |
| `GOVERNANCE.md`「Grok Bot 秘书线已接通」 | **PARTIAL**。接通的是本机 `grok -p` 聊天，不是外部 Grok Bot | `src/secretary/chat.js`；`probeGrokBot()` 仍返回 `UNKNOWN_CONTROL_INTERFACE` |
| `SYSTEM_SNAPSHOT.md`「Grok Bot 已真正接入」 | **错误表述**。外部 `Grok Bot.exe` 未接入；内部只是 grok CLI 聊天 | 桌面快捷方式指向独立 Electron；OS 无 webhook/socket |
| `PROJECT_STATE.md`「Grok Bot deferred / T6 DEFERRED」 | **部分仍真**：外部控制接口未验证 | `/api/health.secretary.status = UNKNOWN_CONTROL_INTERFACE`，`canDispatch: false` |
| `SYSTEM_SNAPSHOT.md`「138 项测试」/ `PROJECT_STATE.md`「116/116」 | **过时** | 本次 `npm test` = **151 pass / 0 fail** |
| `CURRENT_STATE.md`「Antigravity permissionMode=configured」 | **与运行时不符** | 实时 health：`permissionMode: "dangerous-bypass"`，`securityRisk: ALL_TOOLS_AUTO_APPROVED` |
| `CURRENT_STATE.md` / `PROJECT_STATE.md`「Hermes/DeepSeek = DeepSeek」 | **与运行时不符** | 实时 health：Hermes `gemini-flash-3.7`，detail =「Hermes Gemini Flash 3.7 High provider verified」 |
| `WORKFORCE_ROUTER_AUDIT.md`「尚未改代码 / Phase 1 仅规划」 | **过时** | `src/workforce/*`、`/api/workforce/*`、`test/workforceRouter.test.js` 已存在 |
| `SYSTEM_SNAPSHOT.md`「59 个核心 API」 | **过时** | 另有 `/api/workforce/status|workers|routing|events` |
| UI 徽章「Grok Bot: 秘书线已接通 · grok -p」 | **误导** | 把 grok CLI 聊天写成 Grok Bot 控制接口已通。`probeGrokBot.canSubmit` 仍为 false |

**硬区分（本方案全程遵守）：**

1. **外部 Grok Bot.exe** = 桌面独立 Electron 应用  
   路径：`D:\新建文件夹 (3)\Grok Bot\Grok Bot.exe`（桌面快捷方式 `Grok Bot.lnk`）。  
   Founder OS **没有**针对它的 API、Webhook、Socket、端口监听或源码适配器。  
   **结论：外部 Grok Bot 没有接入 Founder OS。**
2. **本机秘书聊天** = `src/secretary/chat.js` 每次拉起 `grok.exe -p --output-format plain`。  
   这是 **Grok Build TUI 的一次性对话**，与 Grok / Grok Build 共享同一个 `C:\Users\22145\.grok\bin\grok.EXE`。  
   **结论：grok CLI 可以聊天 ≠ Grok Bot 已经接管 Founder OS。**
3. **探测器** `src/secretary/probeGrokBot.js` 读 `grok --help`，命中 `Grok Build TUI` 后固定返回：  
   `status=UNKNOWN_CONTROL_INTERFACE`，`available=false`，`canSubmit=false`，**`canDispatch` 恒为 false**。

---

## 一、当前真实架构和任务流

### 1.1 运行时（2026-09-03 实测）

```
Founder
  ├─ 浏览器 Dashboard  http://127.0.0.1:3210   IMPLEMENTED
  ├─ 手机 /phone（需 npm run start:phone）      IMPLEMENTED（本轮未测手机令牌）
  └─ 外部 Grok Bot.exe                          未接入（见第二节）

Local Control Center  (Node.js + Express, server.js)
  ├─ Task store          data/tasks/*.json
  ├─ Approval queue      GET /api/approvals
  ├─ Memory ledger       data/memory/{candidates,items}
  ├─ Content packages    data/content/packages/*.json
  ├─ Secretary inbox     data/secretary/inbox
  ├─ Secretary chat      data/secretary/chat   ← grok -p
  ├─ Workforce registry  data/workforce/workers.json
  ├─ Quota               data/quota/worker-quota.json
  ├─ Billing             data/billing/deepseek-YYYY-MM.json
  └─ Reports             data/reports/*        ← 无列表 API

Workers（CLI spawn，不是云 API）
  Codex        READY   gpt-5.6-luna
  Antigravity  INSTALLED + dangerous-bypass   gemini-3.8-flash-high
  Grok/Grok Build  READY  同一 grok.exe
  Claude       AUTH_REQUIRED  不可派工
  Hermes       READY  Gemini Flash 3.7 High（不是 DeepSeek）
  DeepSeek     经 Hermes --provider deepseek，受 ¥30 硬闸
  grok-bot     UNKNOWN_CONTROL_INTERFACE，禁止当 Task Worker
```

**存储**：JSON + Markdown。无 SQL、无 Redis、无 WebSocket、无消息队列。前端原生 HTML/CSS/JS，轮询 REST。  
**依赖**：仅 `express`。符合 Ponytail。

### 1.2 真实任务流（代码路径，不是愿望图）

```
Founder 输入
  ├─ POST /api/tasks          直接立项（默认 execute=true）
  ├─ 秘书聊天 → 点「转为草稿」→ POST /api/secretary/chat/:id/to-inbox
  └─ 备用导入 POST /api/secretary/inbox

createTask()  (src/store.js)
  ├─ classifyTaskRisk()       高风险 → status=awaiting_approval，零 dispatch
  └─ 低风险   → status=draft（看板创建时再改 queued 并 dispatch）

dispatchTask()  (src/router.js)
  ├─ scanAllRebounds()        尝试探活冷却 Worker
  ├─ 高风险未签字 → 停
  ├─ evaluateModelNeed()      关键词打分 LOW/MEDIUM/HIGH
  ├─ applyCostGuard()         额度 / 付费隔离 / 健康
  ├─ 高难 + 强模型不可用 → Antigravity SAFE PREWORK → waiting_for_capacity
  ├─ runAgent()               spawn CLI
  ├─ 不可用 → FALLBACK_CHAIN 有限替换
  ├─ verifyTask()             机器验收；失败最多 1 次 repair
  ├─ Antigravity 仍失败且 MEDIUM/HIGH → escalate Codex / Grok Build
  └─ completed | failed | waiting_for_capacity | blocked

产物
  ├─ 任务 JSON 的 result.deliverables.artifacts[]   仅 {label, path}
  ├─ 内容包 media[]                                 仅 {kind, path}
  └─ data/reports/<taskId>-<agent>.json|.log
```

**实时任务账本（GET /api/tasks）**

| 状态 | 数量 | 说明 |
| :--- | ---: | :--- |
| completed | 49 | 最近完成：P0-1/P0-2 实验账本与录数 UI |
| failed | 5 | 含额度/断线/测试夹具 |
| cancelled | 2 | 路由探测任务 |
| draft | 2 | 含秘书收件箱自动生成的草稿，**未执行** |
| running / queued / waiting_for_capacity / awaiting_approval（任务） | **0** | 当前没有在跑的任务 |

**实时审批（GET /api/approvals）**：5 条，**全部是发布包**，不是任务。卡尼曼三篇 + 课题分离两篇，均 `awaiting_approval`。  
**实时秘书 Inbox**：1 条，`converted` → 任务 `1788179753849-3e606e`。  
**实时内容包**：10 个（5 待批、3 draft、1 approved、1 published 测试夹具）。  
**实时记忆**：active 10，candidate 1。  
**实时账单**：DeepSeek 2026-09 已用 ¥0.2 / 限额 ¥30，剩余 ¥29.6。  
**实时 Workforce**：registry 全员 `AVAILABLE`，`waitingForCapacityCount=0`。注意：registry 里 `grok-bot.status=AVAILABLE`，与 health 的 `UNKNOWN_CONTROL_INTERFACE` **不一致**。

### 1.3 模块落地对照（只认代码 + 测试 + 实时 API）

| 模块 | 状态 | 依据 |
| :--- | :--- | :--- |
| 控制中枢 :3210 | **IMPLEMENTED** | health 200，`dryRun=false` |
| 任务生命周期 / 回收站 | **IMPLEMENTED** | `src/store.js` + 151 测中的 lifecycle |
| 高风险审批队列 | **IMPLEMENTED** | `src/tasks/risk.js`，`/api/approvals` |
| `/send` 永 403 | **IMPLEMENTED** | `server.js` `rejectAutoSend`；测试锁定 |
| Memory 候选→确认→版本覆盖 | **IMPLEMENTED** | `src/memory/store.js`；10 张 active |
| Prompt 注入 ponytail + memory + read-scope | **IMPLEMENTED** | `src/router.js` `buildPrompt` |
| 内容三层 + 冻结哈希 + Experiment/Metrics | **IMPLEMENTED** | `src/content/store.js`；P0-1/P0-2 测试 |
| xhs-mcp 批准后发布 | **IMPLEMENTED**（依赖本机登录） | `src/publish/xhs.js`；未上号则停 `approved` |
| CostGuard + DeepSeek ¥30 | **IMPLEMENTED**（仅 DeepSeek provider） | Hermes 当前走 Gemini，**不走这笔账** |
| Workforce Registry / modelNeed / Prework / 付费隔离 | **PARTIAL** | 代码+7 个测试在；生产 fallback 仍会把轻任务扔给 Codex |
| Rebound 自动重派 | **PARTIAL** | 只把任务改回 `queued`，**没有 dispatcher 再 `dispatchTask`** |
| 本机秘书聊天 grok -p | **IMPLEMENTED** | 2 轮真实对话落盘，engine=`grok -p (subscription CLI)` |
| 秘书读 OS 状态 | **PLANNED** | `buildChatPrompt` 只有人格+10 轮历史 |
| 外部 Grok Bot.exe 接入 | **PLANNED**（当前未接入） | 无 API/Webhook/Socket |
| Company Brain（多域 + 证据计数 + 置信度） | **PLANNED** | 现有只是 Memory Ledger |
| Learning Event | **PLANNED** | 全库无 `FOUNDER_SELECTED` 等事件类型 |
| File Registry | **PLANNED** | 产物只有 path，无 SHA-256/MIME/size/delivery |
| Delivery Outbox | **PLANNED** | 不存在 `data/delivery` |
| 统一 Learning Router | **PLANNED** | 不存在 |
| 7 角色自动流水线 / 漏斗诊断 / 每日 CEO Brief | **PLANNED** | 只在宪法文档 |
| 主动外部通知 | **PLANNED** | 无 Telegram/微信/飞书 |
| Hermes 作为 COO 编排全部派工 | **PLANNED** | 真实编排器是本地 `router.js` |
| 文档与运行时一致性 | **BROKEN** | 见第 0 节 |

---

## 二、Grok Bot 秘书当前到底能做什么

必须拆成三个东西。混在一起就会写出「Grok Bot 已接管」这种假结论。

### 2.1 外部 Grok Bot.exe — 未接入

| 项 | 事实 |
| :--- | :--- |
| 二进制 | `D:\新建文件夹 (3)\Grok Bot\Grok Bot.exe`（Electron，含 `LICENSE.electron.txt`、`app.asar`） |
| Founder OS 源码引用 | **无**（除快捷方式在桌面、文档口头提到） |
| 监听端口 / Webhook / Socket | Founder OS **没有**对应服务 |
| `probeGrokBot()` | 不探测该 exe；只探测 PATH 上的 `grok.exe` |
| 结论 | **外部 Grok Bot 没有接入。** 不能读任务、不能派工、不能收 OS 事件。 |

本轮**禁止**为了「打通秘书」去逆向 `app.asar` 或给它开端口。那是新控制接口，必须 Founder 单独批准。

### 2.2 本机 grok -p 秘书聊天 — 已实现，范围极窄

**能做（有源码 + 测试 + 真实落盘）：**

- 在 Dashboard「Grok 秘书」输入纯文本，`POST /api/secretary/chat`
- 引擎：`grok.exe -p <prompt> --output-format plain`，**不带** `--always-approve`
- Prompt 内容：人格文件 `founder_os/GROK_BOT_PERSONA.md` + 最近 10 轮压缩对话 + 当前一句
- 回复纯文本；可点「设为规则」追加到人格「调教记录」
- 可点「转为收件箱草稿」：把**创始人那一句**丢进 inbox（不是把 Bot 回复当任务）
- 零执行权：`runAgent("grok-bot")` 直接拒绝；`canDispatch` 恒 false
- 实测：`turn-1788366551433` / `turn-1788366573749`，耗时 22s，engine 字段写明 `grok -p (subscription CLI)`

**不能做：**

- 不知道当前有没有任务、失败、待审批、报告、文件、额度
- 不能列目录、不能打开产物、不能发文件
- 不能创建并执行任务（inbox 只产 **draft**，且 accept 也不 `dispatchTask`）
- 不能确认记忆
- 不能发布、付款、删文件
- 不能主动找 Founder（无推送、无定时 CEO Brief）
- 收图片 / 附件：**不能**

### 2.3 秘书收件箱 — 已实现，但「草稿」会提前写进任务表

`receiveMessage()` 默认 `autoConvert=true`：

- 任务口吻 → **立刻** `createTask()`，status=`draft` 或高风险 `awaiting_approval`
- 偏好口吻 → **立刻** `createCandidate()`，status=`candidate`
- 两者都不 dispatch、不 confirm

测试锁死了「不自动执行」。实时账本里仍留着秘书测试草稿：

- `1788364278478-b4428b` `[秘书收件箱] 分析并重构前端按钮的响应动效…` status=`draft`

**缺陷**：Inbox reject **不会删除**已创建的 draft 任务 / candidate。收件箱「忽略」后，任务表里脏数据还在。

`acceptSecretaryMessage` 只把 inbox 标 `accepted`，toast「已转为草稿任务」，**仍不派工**。要执行必须 Founder 再去任务看板点运行。这是安全的，也是摩擦点。

---

## 三、秘书缺少哪些只读能力

OS **已经有**这些数据。秘书聊天 **完全没注入**。  
最小修法：在 `buildChatPrompt` 前拼一份 **确定性 JSON 快照**（规则代码，0 token 生成；只把摘要文本丢给 grok -p）。**不要**为了读状态再开一轮大模型。

| 秘书应能回答 | OS 现有事实源 | 秘书现在 | 最小注入字段 |
| :--- | :--- | :--- | :--- |
| 当前任务 | `GET /api/tasks` 中 `running/queued/verifying/repairing/waiting_for_capacity` | **不能** | id, title, status, agentResolved, startedAt |
| 已完成任务 | 同接口 `completed`，按 `finishedAt` 最近 N 条 | **不能** | id, title, finishedAt, agentResolved |
| 失败任务 | 同接口 `failed` | **不能** | id, title, error 截断, agentResolved |
| 待审批 | `GET /api/approvals`（任务 + 发布包） | **不能** | id, title, approvalType, riskReasons |
| 最新报告 | `data/reports/*`（**无 API**） | **不能** | 最近报告文件名、taskId、agent、mtime |
| 文件产物 | 任务 `deliverables.artifacts` + 内容包 `media` | **不能** | fileId/path/label/taskOrPackageId |
| Worker 状态 | `GET /api/workers/board` + `GET /api/workforce/status` | **不能** | id, healthStatus, wf.status, quota, billingType |
| 成本和额度 | `GET /api/billing/deepseek` + `data/quota/worker-quota.json` | **不能** | remainingCny, worker quota status |
| 需要 Founder 决定的事项 | approvals + memory candidates + waiting_for_capacity + billing alerts | **不能** | 统一 `decisions[]` |

**复用**：`listTasks`、`listPackages`、`listInbox`、`listActive`/`listCandidates`、`getWorkersRegistry`、`listWorkerHealth`、`getBudgetSummary`、`getQuotaState`。  
**新增接口（建议一条就够）**：`GET /api/secretary/os-snapshot`  
只读，限本机，截断条数（例如各 5 条），禁止塞进密钥/绝对隐私路径。  
**聊天侧**：`src/secretary/chat.js` `buildChatPrompt` 增加 `=== OS SNAPSHOT ===` 块。  
**验收**：问「现在有什么要我批的？」在 grok 未调用前，snapshot JSON 已含 5 个待批发布包；单测用 fake engine 断言 prompt 含 `awaiting_approval`。  
**外部副作用**：**无**。不发消息、不派工、不读 AppData。

P0 只做注入。不要让秘书「自己创建任务并执行」。出口仍是 inbox + Founder 点。

---

## 四、Company Brain 最小实现方案

### 4.1 现状：有 Memory Ledger，没有 Company Brain

现有 `src/memory/store.js` **可以复用为唯一长期记忆持有者**（MODEL ≠ MEMORY 这条已经对）。

已有：

- 状态：`candidate` → `active` | `rejected`；更新走 `proposeUpdate` → 旧卡 `superseded`
- 类型：`aesthetic | goal | priority | project_context | judgment | taboo | decision | life`
- 许可：`understand_only | influence_or_paraphrase | attributable`
- 版本：`version` + `supersedes`
- 敏感拦截：`assertNoSecrets`
- Worker 读取：`buildMemoryContext()` 注入 `buildPrompt`（最多 10 条 active）
- 创始人确认：`POST /api/memory/candidates/:id/confirm`

**没有**：

- Learning Event
- `FOUNDER_SELECTED` / 接受 / 拒绝 / 重做 / 修改 / 特别喜欢
- `evidenceCount` / `confidence` / `trend` / `positiveExamples` / `negativeExamples`
- 状态 `TESTING` / `DECLINING`
- 一次反馈禁止变永久规则（现在 **点一次 confirm 就 active**，立刻进所有 Worker prompt）
- 审美 A/B 选择记录

实时已有一张高质量审美卡 `mem-1788369512261-1056bd`（30 秒停留 + 绘本画报），是 Founder 明示同步，不是统计出来的。另有一张**未确认**候选：黑白红时装秀封面——与现行绘本标杆**可能冲突**。这正说明需要证据层，而不是再确认一张就覆盖审美。

### 4.2 最小数据模型（JSON，不加数据库）

**A. Learning Event**（先写事件，再考虑规则）

路径：`data/learning/events/<eventId>.json`  
append-only，禁止 Worker 直接改 `data/memory/items`。

```json
{
  "id": "evt-...",
  "type": "FOUNDER_SELECTED | FOUNDER_APPROVED | FOUNDER_REJECTED | FOUNDER_EDITED | FOUNDER_REGENERATED | FOUNDER_FAVORITED | TASK_SUCCEEDED | TASK_FAILED | CONTENT_OUTPERFORMED | CONTENT_UNDERPERFORMED | AGENT_ESCALATED",
  "domain": "visual | copy | routing | strategy | engineering | process",
  "at": "ISO-8601",
  "actor": "founder | system",
  "subject": { "kind": "package|task|memory|artifact|chat", "id": "..." },
  "winner": null,
  "losers": [],
  "explicitFeedback": null,
  "payload": {},
  "processed": false
}
```

**B. Memory 字段扩展**（加在现有 candidate/item 上，不新建第二套账本）

```text
status:        candidate | testing | active | declining | rejected | superseded
domain:        visual | copy | routing | strategy | engineering | process | general
confidence:    0..1          默认 0
evidenceCount: integer       默认 0
sources:       [eventId...]
trend:         rising | stable | falling | unknown
positiveExamples: [{ ref, note }]
negativeExamples: [{ ref, note }]
lastValidated: ISO-8601 | null
```

**晋升规则（纯代码，0 模型）：**

| 从 | 到 | 条件 |
| :--- | :--- | :--- |
| 新事件 | candidate | 任何 Founder 显式反馈或选择 |
| candidate | testing | Founder **确认候选**（保持现有 confirm 按钮，但 confirm ≠ 永久 active） |
| testing | active | `evidenceCount >= 3` 且 `confidence >= 0.7` 且无未解决矛盾 |
| active | declining | 相反证据连续累积，或 Founder 新选择与规则冲突 |
| 任意 | rejected | Founder 明示否决 |

**Founder 一次确认**只把卡推进 `testing`（或提高 evidenceCount +1）。  
**禁止**：一句话 / 一次聊天 / 一次「设为规则」直接变成全员 prompt 永久人格。  
现有「设为规则」只改 `GROK_BOT_PERSONA.md`，**不要**再自动写成 Company Brain active 规则。人格文件 ≠ 公司记忆。

**矛盾**：同一 domain 两张 testing/active 卡语义冲突 → 保持都是 testing，写一条 `LEARNING_CONFLICT` 事件，**默认不调用 Hermes**。只有 Founder 点「升级学习主管」或 CostGuard 允许时才用 Hermes。

### 4.3 Founder 行为如何落成事件（复用现有按钮）

| 行为 | 现有入口 | 加什么 |
| :--- | :--- | :--- |
| 批准任务 / 发布包 | `POST .../approve` | 写 `FOUNDER_APPROVED` |
| 驳回 | `POST .../reject` | `FOUNDER_REJECTED` |
| 确认记忆 | `POST /api/memory/candidates/:id/confirm` | `FOUNDER_APPROVED` + evidenceCount+1；**改成进入 testing 而非直接 active**（行为变化，需 Founder 批准） |
| 驳回记忆 | `.../reject` | `FOUNDER_REJECTED` |
| 编辑发布包 | `PATCH /api/content/packages/:id` | `FOUNDER_EDITED`（diff 摘要，不存全文密钥） |
| 重做 / 再生成 | 任务 `run` / 前端若有 regenerate | `FOUNDER_REGENERATED` |
| 从 A/B/C 选 B | **没有 UI** | 新增最小：内容工作台或产物卡上「选这个」；body: `{ winnerId, loserIds[], domain }` → `FOUNDER_SELECTED` |
| 特别喜欢 | **没有** | 按钮 `favorite` → `FOUNDER_FAVORITED` |
| 任务成功/失败 | `dispatchTask` 终态 | `TASK_SUCCEEDED` / `TASK_FAILED`（系统事件，不耗模型） |
| 指标录入后优劣 | `POST .../metrics` | 规则：互动率相对账号中位 → OUT/UNDERPERFORMED |

### 4.4 所有 Worker 读同一份偏好

**复用** `src/memory/inject.js` `buildMemoryContext`。

改动：只注入 `status in (active, testing)` 且 `license` 允许的卡；`testing` 标明「试用中，证据不足」。按 domain + 当前任务文本做 **本地关键词过滤**（现有 `projectScope` 已可筛项目）。仍最多 10 条。秘书 snapshot 与 Worker prompt **读同一函数**。

### 4.5 防污染

1. 事件可写，长期规则不可被 Agent 直接写。  
2. 密钥正则继续跑 `assertNoSecrets`。  
3. `understand_only` 继续禁止公开引用。  
4. 单次 confirm ≠ active。  
5. 冲突不自动覆盖赢家。  
6. 不把 grok-p 聊天全文当记忆（现有 ChatGPT 桥已经遵守「不落盘全文」）。  
7. Learning Router：能用计数就计数。升级 Hermes 默认关。

**新增文件**：`src/learning/events.js`、`src/learning/router.js`（纯函数）、`data/learning/events/`、`test/learning.test.js`  
**修改**：`src/memory/store.js`（字段默认值 + confirm 进入 testing）、`server.js` 各 approve/reject/metrics 挂钩、`public/app.js` 增加「选这个 / 喜欢」两个按钮。  
**接口**：`POST /api/learning/events`（内部也可直接函数调用）；`GET /api/learning/events?domain=&type=`；`GET /api/brain/relevant?domain=&taskId=`（薄封装 listActive）。  
**验收**：选 B 不选 A/C → 一条 `FOUNDER_SELECTED`；同一规则 3 次正向才 active；1 次正向 confirm 后 Worker prompt 标 testing；冲突不覆盖；`npm test` 全绿。  
**外部副作用**：**无**。

---

## 五、File Registry 和 Delivery Outbox 最小实现方案

### 5.1 现状

| 索引 | 字段 | 缺什么 |
| :--- | :--- | :--- |
| `deliverables.artifacts[]` | `label`, `path` | fileId、taskId、MIME、size、SHA-256、worker、验收、发送许可、delivery |
| 内容包 `media[]` | `kind`, `path` | 同上；冻结哈希只 hash **路径字符串**，不 hash 文件字节 |
| `data/reports/*` | 执行日志 | 不是产物登记 |
| 打开文件 | `POST /api/tasks/:id/artifacts/:index/open` | 已能用 explorer 打开 |

**不存在**全局 `data/files/` 或 `data/delivery/`。

### 5.2 File Registry

路径：`data/files/<fileId>.json`  
登记函数：任务完成写 artifacts 时、内容包 freeze/保存 media 时各调一次。

每个产物最低字段：

```text
fileId            稳定 id
taskId            可空（内容包用 packageId）
packageId         可空
fileName
absolutePath
relativePath      相对 workspace
mimeType
sizeBytes
sha256            文件字节完整 hex，不是 16 位 payload 哈希
createdAt
sourceWorker
accepted          bool   来自 verifyTask.ok 或创始人点验收
allowSend         bool   默认 false；只有 Founder 批准发布包后对「该包媒体」为 true
deliveryStatus    held | allowed | sent | blocked | n/a
```

**复用**：`src/tasks/deliverables.js`（扩展返回）、`src/content/store.js` media、`crypto.createHash("sha256")` 已在内容包使用。  
**新增**：`src/files/registry.js`  
**接口**：`GET /api/files?taskId=`、`GET /api/files/:fileId`、已有 open 改为也可按 fileId 打开。  
**验收**：完成带 `ARTIFACT:` 的任务后，registry 有 sha256 且 `fs.stat` size 一致；改文件字节后 sha256 变；秘书 snapshot 能列出最近产物文件名。  
**外部副作用**：**无**（只读盘、写 JSON）。禁止把 allowSend=true 接到 `/send`。

### 5.3 Delivery Outbox

路径：`data/delivery/outbox/<deliveryId>.json`

```text
deliveryId, fileId, packageId, channel (xiaohongshu|none),
status: held | allowed | sent | blocked,
allowSend 继承 file.allowSend,
createdAt, decidedAt, sentAt, error
```

规则：

- 默认 `held`
- 发布包 Founder **批准**后，该包媒体 → `allowed`（仍不自动发）
- 真正外发只走现有 `POST /api/content/packages/:id/publish`（本机 xhs-mcp）
- `/api/content/packages/:id/send` 与 `/api/publish/:id/send` **保持 403**
- Worker **永远**不能把 outbox 标 sent
- **本阶段不接微信/飞书/Telegram**

**复用**：`approvePackage`、`publishApprovedPackage`  
**新增**：`src/delivery/outbox.js`  
**接口**：`GET /api/delivery/outbox`  
**验收**：未批准包的媒体 allowSend=false；批准后 outbox=allowed 且未调用 MCP；publish 成功后 sent；直接 POST /send 仍 403。  
**外部副作用**：无新增通道。现有 publish 仍可能发小红书——那是**已有**能力，本方案不扩大。

---

## 六、Workforce Router 应如何结合

### 6.1 已有、可复用

| 文件 | 作用 | 完整度 |
| :--- | :--- | :--- |
| `src/workforce/registry.js` | 能力、quotaClass、billingType、autoFallback | IMPLEMENTED |
| `src/workforce/statusMachine.js` | 9 态 | IMPLEMENTED |
| `src/workforce/modelNeed.js` | 0–100 分 + preferredWorker | PARTIAL（关键词误伤） |
| `src/workforce/prework.js` | SAFE PREWORK | IMPLEMENTED（测试 TEST 3） |
| `src/workforce/rebound.js` | 探活 + 改 queued | PARTIAL（不重派） |
| `src/workforce/errorClassifier.js` | 7 类错误 | IMPLEMENTED |
| `src/workforce/routingLogger.js` | 决策日志 | IMPLEMENTED |
| `src/workers/costGuard.js` | 付费隔离、exhausted 跳过 | IMPLEMENTED |
| `src/workers/ids.js` `FALLBACK_CHAIN` | `codex, claude, antigravity, grok-build` | **与「够用+便宜优先」相反** |

测试 TEST 1–7 在隔离目录下通过。**生产日志打脸**：`data/workforce/routing_logs.json` 多条 LOW 分任务（score 28，preferred antigravity）因 `HEADLESS_PERMISSION_BLOCKED` **fallback 到 Codex**。这是在浪费稀缺高级工程师。

当前运行时 Antigravity 已是 `dangerous-bypass`，所以此刻这条路径不一定再触发，但 **FALLBACK_CHAIN 顺序没改**，一切换回 configured 就会再烧 Codex。

### 6.2 目标决策顺序（仍全是规则，不调大模型）

```
1. 风险：high 且未签字 → 停（已有）
2. 能力：modelNeed.preferredWorker 必须具备所需 capability
3. 真实可用：health.available AND registry.status ∈ {AVAILABLE, LOW, BUSY?}
4. 额度：quota ≠ exhausted AND 非 EXHAUSTED/COOLDOWN/THROTTLED
5. 成本：同等能力下 fallbackPriority 高的先用
   Antigravity (100) > Claude(40) > Grok Build(30) > Codex(20)
   Hermes/DeepSeek fallbackPriority=0 且 autoFallback=false（已有，保持）
6. 失败：有限 fallback
   LOW/MEDIUM 可降级到下一便宜且能力足够的 Worker
   HIGH + requiresSeniorWorker → Prework + WAITING_FOR_CAPACITY，禁止 Antigravity 全权改核心
7. Rebound：探活成功 → AVAILABLE → 对 waiting_for_capacity 调用 dispatchTask
   （现在只改 queued，任务会躺着）
```

**BUSY**：registry 有字段，派工时未写 BUSY。最小：`dispatchTask` 开头标 BUSY，结束 `recordWorkerSuccess`。不要上队列中间件。

**额度**：现在只有 founder 手动 `normal|exhausted`，没有真实剩余小时。最小保持手动；probe 失败用 errorClassifier 标 COOLDOWN。不要为了读额度去跑一次付费/耗时对话。

**Hermes**：保持 `allowPaidFallback` 默认 false。实时 Hermes 是 Gemini Flash 3.7 High，**DeepSeek ¥30 闸管不到它**。P1 再决定：把 Hermes 当前 provider 标成「订阅反代」还是「仍当付费」。在 Founder 拍板前，**继续禁止 auto fallback 到 Hermes**。

### 6.3 建议改动

**复用**：上述 workforce 文件 + `src/router.js` `dispatchTask` + `src/workers/costGuard.js`  
**改**：

1. `FALLBACK_CHAIN` 改为按 `fallbackPriority` 降序，并 **过滤** `reserveForHighValue && modelNeed.tier==LOW`
2. `wakeWaitingTasks` 成功后对每个被唤醒 id 调 `dispatchTask`（try/catch，失败保持 queued）
3. registry 的 grok-bot 不要标 `AVAILABLE` + `command_interface`；与 probe 对齐为 `UNKNOWN_CONTROL_INTERFACE`，且永不进 FALLBACK_CHAIN（已基本如此）
4. `modelNeed`：标题含「重构按钮/hover/CSS」不得因「重构」二字升 HIGH（收紧 HIGH 关键词或要求同时命中 core/scheduler/architecture）

**接口**：已有 `/api/workforce/*`，够用。  
**验收**：重放 routing_logs 里那类 LOW 任务，Antigravity 不可用时 **不得**选 Codex；HIGH+Codex 冷却 → prework + waiting；mock rebound 后任务进入 running（dryRun 即可）；Hermes 在 allowPaidFallback=false 时永不入选。  
**外部副作用**：**无**（不改权限、不改 config.json）。

**不在本阶段做**：把 Antigravity 从 dangerous-bypass 改回 configured——那是权限变化，必须 Founder 决定。

---

## 七、P0 / P1 / P2 问题

### P0（阻塞「公司变聪明」或正在烧错额度）

1. **秘书是瞎子**  
   grok -p 能聊，但 0 条 OS 状态。Founder 问「要我批什么 / 刚才那单怎样了」只能靠人自己看看板。  
   这是 Founder Touches 下不来的主因之一。

2. **外部 Grok Bot 与内部秘书被文档/UI 混为一谈**  
   徽章写「秘书线已接通」，probe 写 UNKNOWN。后续 Agent 会按假事实设计。  
   先改表述，再谈要不要接 exe。

3. **没有 Learning Event**  
   批准、驳回、选图、改文、重做都发生了，系统不记。Memory 一次 confirm 即永久。审美冲突（绘本标杆 vs 黑白红时装候选）没有证据层。

4. **没有 File Registry / Delivery Outbox**  
   产物只有路径。秘书无法汇报「文件在哪、验收没有、能不能发」。发送许可未结构化，只靠发布包状态。

5. **Workforce fallback 仍是「强模型优先」**  
   `FALLBACK_CHAIN` 以 Codex 打头。历史日志已把 LOW 任务打到 Codex。Rebound 不重派，WAITING 任务会睡死。

6. **运行时与宪法不一致（会害下一任 Agent）**  
   Hermes≠DeepSeek；Antigravity=dangerous-bypass；测试数 151 不是 138。不修文档也会导致重复施工。

### P1（效率与学习质量）

1. Inbox `autoConvert` 提前创建 draft 任务，reject 不回收。  
2. `modelNeed` 把「重构按钮」判成 Codex 级。  
3. Memory confirm 语义过猛（应用 testing）。  
4. 无 A/B「选这个」UI，审美无法统计。  
5. 报告无 `GET /api/reports` 摘要，秘书和看板都难读。  
6. Hermes 实际走 Gemini 反代，¥30 闸对它无效——需要 Founder 定性。  
7. Claude `AUTH_REQUIRED`，review 路由会空转再 fallback。  
8. 无 CEO Brief 压缩（可用 snapshot 规则生成 Markdown，仍 0 模型）。

### P2（以后再说）

1. 接入外部 Grok Bot.exe（新控制面，高风险）。  
2. 微信/飞书/Telegram 推送。  
3. 7 角色自动 DAG。  
4. 小红书免登录数据采集。  
5. SQLite / 分页（58 个任务尚不需要）。  
6. 用大模型做 Learning Supervisor（默认 Hermes，且默认关）。

---

## 八、最小分阶段修复顺序

**约束**：不引入 React/Vue/SQL/Redis/队列；不改 `config.json`、权限模式、Token、外部账号；不自动发布/外发/付款/删数据；不把 Hermes 当普通事件处理器；不接 Grok Bot.exe，除非本方案获批后 Founder **单独**批准第 0 项以外的接入。

每阶段都写：复用、新增、验收、副作用。

---

### 阶段 0 — 诚实口径（先于功能）

**做什么**：改 UI 徽章与内部文档表述，把三套 Grok 写清楚。可选：本方案落地后同步 `PROJECT_STATE.md` 测试数为 151。  
**复用**：`public/app.js` `loadHealth()`、`docs/GROK_BOT.md`（这份已经是对的）、`src/secretary/probeGrokBot.js`  
**新增接口**：无  
**验收**：health.secretary.status 仍为 UNKNOWN 时，徽章不得写「Grok Bot 已接通」；可写「本机 grok -p 聊天可用 · 外部 Grok Bot.exe 未接入」。  
**副作用**：无。

---

### 阶段 1 — 秘书只读 OS Snapshot（P0）

**复用**：`listTasks`、`listPackages`、approvals 逻辑、`listWorkerHealth`、`getBudgetSummary`、`getQuotaState`、`listCandidates`、`src/secretary/chat.js`  
**新增**：

- `src/secretary/osSnapshot.js`
- `GET /api/secretary/os-snapshot`
- `buildChatPrompt` 注入截断快照

**字段**：见第三节表。条数上限各 5。  
**验收**：单测 fake engine；实时问审批，prompt 含 5 个发布包 id；不出现 token/密码。  
**副作用**：无。多消耗的只是 grok -p 已有对话的 prompt 长度（快照控制在 2–4KB）。

---

### 阶段 2 — Learning Event 挂钩（P0）

**复用**：所有现成 approve/reject/confirm/metrics/dispatch 终态  
**新增**：`src/learning/events.js`、`data/learning/events/`、`POST/GET /api/learning/events`  
**先做系统事件 + Founder 批准/驳回**，A/B 按钮可同阶段加两个 DOM 按钮，不加新页面。  
**验收**：批准一个发布包（测试夹具，不 publish）产生 `FOUNDER_APPROVED`；任务 failed 产生 `TASK_FAILED`；无模型调用。  
**副作用**：无（测试不要点「立即发布」）。

---

### 阶段 3 — Memory 证据层（P0/P1）

**复用**：`src/memory/store.js`、`inject.js`  
**新增字段**：见 4.2；`confirmCandidate` 默认进入 `testing`  
**Learning Router**：`src/learning/router.js` 只做计数与冲突检测  
**验收**：1 次 confirm ≠ 进入 `buildMemoryContext` 的永久 active；3 次同向证据 → active；反向证据 → declining；冲突不覆盖。  
**副作用**：无。  
**需 Founder 拍板的一点**：现有 10 张 active 卡是否 **grandfather** 为 active（建议：是，只对**新**确认改 testing）。

---

### 阶段 4 — File Registry + Outbox（P0）

**复用**：`deliverables.js`、内容包 media、open artifact  
**新增**：`src/files/registry.js`、`src/delivery/outbox.js`、`GET /api/files`、`GET /api/delivery/outbox`  
**验收**：见第五节。`/send` 仍 403。  
**副作用**：无新外发。

阶段 1 的 snapshot 在本阶段改为读 registry，而不是临时扫 tasks。

---

### 阶段 5 — Workforce 便宜优先 + Rebound 真唤醒（P0）

**复用**：`src/workforce/*`、`costGuard.js`、`router.js`  
**改**：FALLBACK_CHAIN 排序与 LOW 禁 Codex；`wakeWaitingTasks` 后 `dispatchTask`；grok-bot registry 状态对齐 probe；收紧「重构」关键词。  
**验收**：见 6.3；`npm test` 151+ 新测全绿。  
**副作用**：无。可能改变**以后**任务的 Worker 选择（这正是目的）。不改当前 Antigravity 权限。

---

### 阶段 6 — 秘书用快照回答「要你决定的事」（P1）

在阶段 1+2+4 之后，snapshot 增加 `decisions[]` 聚合。仍 0 执行权。  
可用规则生成一份 `data/briefs/ceo-latest.md`（不是每日定时，先手动/启动时刷新）。  
**副作用**：无。

---

### 明确不做（除非 Founder 另批）

- 接入 `Grok Bot.exe`
- 任何外部 IM 推送
- 自动发布、自动付款、扩大 `/send`
- 用 Hermes 处理每条 Learning Event
- React / Vue / SQLite / Redis
- 改 `config.json`、bridge token、Antigravity permissionMode
- 多 Agent 同时改 `router.js` 核心（本方案若批准，**一次只让一个执行 Worker 动核心调度**）

---

## 九、建议的验收总闸与指标

现有系统还没有这些计数器。阶段 2 的事件足够用规则算出：

| 指标 | 怎么算 | 期望方向 |
| :--- | :--- | :--- |
| FOUNDER_TOUCHES_PER_TASK | 任务从创建到完成的 Founder API 次数（已有字段 `founderTouches` 目前恒为 1，需在 approve/edit/run 时 +1） | 下降 |
| REPEATED_INSTRUCTION_RATE | 同类 explicitFeedback 重复出现 / 总反馈 | 下降 |
| FOUNDER_CORRECTION_RATE | `FOUNDER_EDITED`+`REJECTED`+`REGENERATED` / 完成任务 | 下降 |
| AGENT_ESCALATION_RATE | 路由日志 isFallback 或 phase=escalation | 受控 |
| STRONG_MODEL_USAGE | Codex/Grok Build 被选中的 LOW 任务数 | **应接近 0** |
| PAID_API_COST | `getBudgetSummary().spentCny` + 未来若 Hermes 计费 | 受控 |
| TASK_SUCCESS_RATE | completed / (completed+failed) 非夹具 | 上升 |
| LEARNING_CONFIDENCE | active 卡平均 confidence | 慢升，禁止暴涨 |

---

## 十、给 Founder 的决策清单（本轮唯一需要人的地方）

施工前请批这几条。未批则停。

1. **是否批准按阶段 0→5 施工？** 一次只让一个执行 Worker 动核心（建议：Antigravity 做 0/1/2/4 的接线；Codex 只做阶段 5 的 router/fallback，若阶段 5 视为高风险）。  
2. **已有 10 张 active 记忆**：grandfather 为 active，还是全部降为 testing？  
3. **Hermes 当前 Gemini Flash 3.7 High**：继续当「订阅反代、仍禁止 auto fallback」，还是纳入 ¥30 闸？  
4. **Antigravity `dangerous-bypass`**：保持（否则 headless 又会堵，并回头烧 Codex）还是改回 `configured`？本方案默认**不改**。  
5. **要不要接外部 Grok Bot.exe**：默认 **不要**。若要，另开高风险任务，单独审批。  
6. **Memory confirm 改为 testing**：会改变现有按钮语义。是否接受？

---

## 十一、本轮 HANDOFF

**我做了什么**  
只读审计。跑了现有测试。打了实时 API。写了本文件。未改业务代码，未改 config.json，未发布，未付款，未调用 Hermes 干活，未碰 Grok Bot.exe。

**改了什么文件**  
仅新增：`IMPROVEMENT_PLAN.md`

**测试**  
`npm test`：151 pass / 0 fail。未跑 smoke:codex / smoke:antigravity（会消耗额度）。

**通过**  
控制中枢存活；任务/审批/inbox/内容包/记忆/账单/workforce API 可读；秘书聊天与外部 Grok Bot 的边界可证伪。

**失败 / 未测**  
未测手机 LAN 令牌；未测 xhs 是否已扫码；未拆 Grok Bot.exe 的 asar（故意）；未读 `config.json` 密钥字段。

**下一步**  
等 Founder 批第十节。批准后按阶段 0 开始，禁止跨阶段重构。

**需要更强模型的点**  
阶段 5 若动 `dispatchTask` 主循环，建议 Codex 做第二人审查。其余阶段 Antigravity 足够。

**需要 Founder 决策**  
见第十节。在此之前 **不自动施工**。
