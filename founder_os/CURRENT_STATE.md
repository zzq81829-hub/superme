# Current State — V1

## Primary objective
First prove one complete content production loop before expanding into a general AI-company platform.

## Phase 0 — infrastructure bootstrap
Build a local control plane that can create tasks and route them to Antigravity or Codex without requiring manual prompt copying.

Acceptance:
- local dashboard starts,
- task can be created,
- task can be assigned to an agent,
- execution adapter can be tested in dry-run mode,
- project state is preserved.

### V1 control-plane status — 2026-08-31
- Dashboard, JSON task persistence, deterministic routing, automatic execution, bounded fallback, result polling and report logs are implemented.
- The local runtime is intentionally in real execution mode (`dryRun=false`) at `127.0.0.1:3210`; the generated default remains `dryRun=true`.
- The true V1 orchestrator is the local Router. Hermes is reused as a selectable DeepSeek-backed worker, not yet the dispatcher for every task.
- Read-only cached probes verify Codex ChatGPT login, Grok grok.com login and Hermes DeepSeek provider state. Claude is `ON_DEMAND` while the founder-approved local Antigravity reverse proxy on port 8045 is stopped. Antigravity remains `INSTALLED` because no reliable provider-aware, zero-token probe exists.
- Codex, Antigravity, Grok Build, Grok and Hermes/DeepSeek all have real successful execution evidence. Grok and Grok Build are modes of the same `grok.exe`; Grok Bot is honestly deferred.
- Machine-verifiable acceptance supports exact/contained file content, file existence and allowlisted commands. Checks are restricted to the project directory, and failed checks feed evidence into at most one configured repair attempt.
- Real strict E2E task `1788162612513-cb3353` passed Dashboard -> Codex -> exact artifact -> `npm test` -> persisted verification history in 123,797 ms.
- Main tests pass 39/39. Shuzhai 4/4, Classify King 9/9 and OPC Matrix 11/11 regression suites pass; video-matrix Python compilation also passes.
- The complete audit and phased rollback plan is `docs/CODEX_TAKEOVER_PLAN.md`.

### V1 safety decisions
- The `dryRun` safety switch remains available; the current local runtime is intentionally set to `dryRun=false` for real execution validation.
- Claude resolves to its native executable so task prompts do not pass through `cmd.exe`; verifier commands are allowlisted and reject shell metacharacters.
- Codex is limited to the task workspace. Founder OS no longer edits global Antigravity permissions or silently escalates after a denial.
- Antigravity now uses `permissionMode=configured`. If its headless permission rules are insufficient, the task falls back to another Worker instead of enabling all-tools auto-approval.
- Claude's localhost Antigravity reverse proxy is a founder-approved exception. When it is down, Claude is skipped without waiting for login.
- Command output is bounded in memory and every run has a deadline.

### 2026-08-31 治理与产品定位决策
- **治理与权力归属**：AI CEO 是本机控制系统本身（Control Center），而非任何单一大模型；Grok Bot 为私人秘书/人格入口（当前控制接口未验证，无直接调度权）；Hermes 为 COO（负责拆解、编排与执行跟踪）。单一事实源见 `founder_os/GOVERNANCE.md`。
- **任务卡披露与高风险审批队列**：五大高风险一级打断规则自动识别、创建后安全停在审批队列（零自动 dispatch）、稳定 Payload 哈希校验（任何内容/改派更新立即导致旧审批失效）、任务卡披露工作流/理由/额度/备选、自由改派与顶部一级审批队列均已落地。
- **DeepSeek / Hermes 每月 50 元硬闸与到限提醒**：Hermes+DeepSeek 统一月度账本 (`data/billing`)、每月 50 元硬停（到限 Cost Guard 跳过或报 HUMAN_ACTION_REQUIRED）、预扣与防并发防双记、到限面板置顶横幅提醒、线下充值后手动登记额度均已落地；绝不发起真实扣款。gemini-proxy 已停用。
- **内容三层与冻结发布包**：素材事实、候选表达、观点卡片（三级许可与快照）三层架构落地；`understand_only` 严禁公开与原话引用；发布包冻结锁定哈希，改动任一对外字段立即令审批失效并退回草稿；创始人批准后由控制中枢经本机 xhs-mcp 发到小红书。Worker 的 `/send` 仍 403。未上号则停在 `approved` 等扫码。
- **ChatGPT 浏览器提取桥**：Tampermonkey 脚本 (`public/bridge/chatgpt-extract.user.js`) 与服务端 `/api/bridge/chatgpt/extract` 落地；仅提炼 user 轮次实质判断，零全文落盘；生成候选卡需在控制台确认生效，自动入库未开放；无任何付费模型 API。
- **Grok Bot 秘书协议与本机收件箱**：真实只读探测器（`src/secretary/probeGrokBot.js`）证实当前 `grok.exe` 为 Grok Build TUI，无独立 bot 控制接口，如实标记为 `UNKNOWN_CONTROL_INTERFACE` 且 `canDispatch: false`；本机秘书收件箱（`/api/secretary/inbox`）已落地，支持收集意图并安全生成草稿任务或记忆候选，严格零自动 dispatch、零自动 approve、零自动 confirm。

### 2026-09-01 Worker 分工决策（创始人最新指令）
- **模型分配（2026-09-01 更新）**：Codex = **gpt-5.6-luna**（reasoning high）；Antigravity = **gemini-3.8-flash-high**；Claude 反代 = **claude-sonnet-4-6**；Grok = grok.com 默认；Hermes/DeepSeek = DeepSeek。Claude 与 Antigravity 不再共用模型。
- **历史决策，已于 2026-09-05 取消**：曾强制注入马尾辫；按创始人最新要求，派工已移除 ponytail 强制注入，以完整可用的软件与验收结果为准。

### 2026-09-03 架构事实同步：废除 Antigravity 本地反代
- **创始人明确指示**：已不再对 Antigravity 进行任何本地反向代理（废除 8045 端口代理中间层）。
- **Antigravity**：完全使用官方原生 Google CLI（`agy.exe`，`gemini-3.8-flash-high`），官方身份鉴权，直连服务，不再依赖任何本地反向代理中间件。
- **Hermes**：全面收敛至官方 DeepSeek API（模型 `deepseek-v4-pro`），彻底脱离此前可选的 `custom:gemini-proxy` 反代线路。
- **Claude Code**：不再作为 Antigravity 反代壳层。当前无独立环境时自动保持 `ON_DEMAND` / `OFFLINE`，路由器安全跳过。
- 另：需求简报（`founder_os/BRIEF.md`）、产物审查弹窗、逐任务反馈返工闭环、读取权限边界（`founder_os/READ_SCOPE.md`，隐私与金额禁读）已落地；修复 Hermes 桌面启动器在 venv shim 路径下的安装根目录解析。

### 2026-09-01 Founder-facing V1 refinement
- 完成任务现在生成创始人可读产物：控制台显示可直接使用的能力，不再把 Worker 日志或源码当作产品；已完成文件显示可点击绝对路径。
- 任务详情完整记录派工与回退链：谁被跳过及原因、谁实际执行、做了什么、真实错误、谁接手；Control Center 重启时自动结束没有真实进程的僵尸任务并保留恢复记录。
- 手机端 /phone 采用聚焦工作台：先提交创始人想做的事，提交后自动跳到任务进度；仅在有高风险待审批事项时显示签字入口。
- 电脑端与手机端已统一为「发起任务 / 看进度 / 更多」的信息架构：一句话提交意图，普通任务直接进入进度，高风险任务转入审批；两端共用任务与审批事实源，只按屏幕调整布局。
- 小红书发布包显示图文与文案文件位置，并可直接在本机打开。
- AI CEO 内置 `grilling` 决策树技能；Hermes 仍为 COO，职责口径见 `founder_os/projects/AI_CEO.md`。
- 新增电脑只读安全入口，仅覆盖常用用户资料夹，阻止隐私/凭据/金融路径，并在读取文本时隐藏金额和常见个人标识。
- Hermes 已通过官方更新器升级到最新主线 `e721b03f`，Windows Desktop 客户端已重建；控制台按钮和 Windows 桌面快捷方式都直接打开原生 Desktop 客户端。
- Antigravity 连接层已增加 headless 权限预检：`permissionMode=configured` 时会明确显示 `HEADLESS_PERMISSION_BLOCKED` 并从自动派工/回退链跳过，只有创始人显式启用 `dangerous-bypass`（或在 Antigravity 内配置等价 allow-rules）才会执行需要工具的任务。

### 2026-09-03 审美标杆与内容五支柱准则确立（创始人指令同步）
- **审美标杆确认（绘本叙事 × 杂志封面画报风）**：以《蛤蟆先生》与《金钱心理学》为基准，确立“强叙事油画/绘本肌理背景（视觉占幅大） + 左上浮动米白纸卡 + 红黑经典杂志层级排版 + 底部暗调收底 + 不对称呼吸感构图”为唯一封面规范，严禁 PPT“盒中盒”与色块生硬堆砌。
- **内容打磨 5 大支柱与 30 秒停留法则**：
  1. 终极质检问题：“它为什么值得一个陌生人在小红书停留 30 秒？”
  2. 选题：痛点/恐惧/渴望优先，书永远是后置解药，不搞全书大而全概括；
  3. 情绪：好奇、共鸣、焦虑、反常识、被理解、身份认同（先让人产生感觉）；
  4. Hook：封面标题 + 第一页 + 前 3 句完成 3 秒留存；
  5. 内容价值：即学即用交付，看完能说“这东西我明天就能用”；
  6. 转化闭环：互动评论、清单收藏、长期信任与付费购买。
- **记忆库与规则单一事实源同步**：已将该标准写入记忆账本 (`mem-1788369512261-1056bd`)、`founder_os/FOUNDER_MODEL.md`、`founder_os/BRIEF.md` 与 `founder_os/projects/SHUZHAI.md`。
- **Worker 模型升级**：Antigravity 模型切换为 `gemini-3.8-flash (high)`，长周期软件工程与微步推理能力就位。

### 2026-09-04 生态接入事实同步：启用 Gemini Boost 深度推理与验证模式
- **Gemini Boost 原生接入**：Antigravity（`agy.exe` + `gemini-3.8-flash-high`）全面接入原生 `/boost` 深度推理与多智能体验证模式，派工与配置默认携带 `--effort high` 并自动注入 `/boost` 编排，确保 Gemini 在处理复杂工程与分析任务时激活最大深度。
- **全链路披露与控制台看板**：`config.json`、`src/config.js`、`src/adapters/antigravity.js`、健康探针 `workerHealthMap` 与控制台前端统一披露 `⚡ Boost (high)` 状态，保持既有安全沙盒与权限门禁不变。

### 2026-09-04 架构升级：Founder OS 推理升级策略（Reasoning Escalation Policy）落地
- **自动化动态决策（免人工开关）**：
  - 普通低风险任务（文案修改、小范围 UI、单文件轻量调整、明确方案重复执行）自动保持 `reasoning_mode: "normal"`，节约算力；
  - 命中 10 类高阶特征（3+ 文件、架构/API/数据库/状态管理、重构删除、歧义分析、跨 Agent 编排、Phase 验收、隐藏回归风险等）自动激活 `reasoning_mode: "boost"` 并为 Antigravity 附加 `/boost` 与 `--effort high`；
  - 中风险任务由 OS 自动决策与执行，不打扰创始人；仅涉及资金、外发、物理删除等高风险操作需创始人审批。
- **连续失败分级熔断（Retry Escalation）**：
  - 第 1 次失败：重新分析后普通重试；
  - 第 2 次失败：自动升级为 `boost` 深度推理；
  - 第 3 次失败：自动熔断停止盲目修改，生成结构化失败报告并请求上级审核。
- **Boost 6 维深度验收质检**：
  - 中高风险或 Boost 任务在通过机器常规验证后，执行 6 维度质检：需求实质完成度、修改越界排查、功能完好性、测试充分性、Phase 阶段边界、隐藏回归风险排查，结果记录于 `verification_result`。
- **任务模型字段规范**：
  - 完整固化并持久化 `reasoning_mode`、`boost_reason`、`retry_count`、`risk_level`、`verification_result`，全量测试套件 188 项 100% 通过。


### 2026-09-05 生态接入：Agent Reach 只读情报能力层
- **已接入 OS 路由**：项目级 `agent-reach` skill 与独立 CLI 环境已安装；全网调研、URL 读取和平台检索任务会自动注入其能力说明，普通本地任务不注入。
- **权力边界不变**：仅允许读取、抓取和搜索公开信息；禁止登录、读取浏览器 Cookie、发帖、评论、点赞或上传，所有外部写入继续由 Control Center 审批。
- **当前实测能力**：Agent Reach `doctor` 显示 5/15 个渠道可用（网页/Jina Reader、YouTube、Bilibili 搜索、V2EX、RSS）；OpenCLI `1.8.7` 与 `twitter-cli 0.8.5` 已安装。小红书和 X/Twitter 仍为 `warn`：OpenCLI 守护进程正常但 Chrome 扩展尚未由创始人手动安装/连接，Twitter 未导入显式凭据。未读取浏览器 Cookie，也未替创始人登录；GitHub 登录与 Exa 实际检索仍未宣称通过。

### 2026-09-05 治理与内容升级：Hermes COO 需求分发与西方名画动态轮转
- **Hermes (COO) 需求拆解与分发全链路闭环**：
  - Hermes 正式作为 COO 接入 OS 派发层（`src/workforce/hermesDispatcher.js`、`src/router.js`、`server.js`、`public/`）；
  - 创始人提交宏观意图或勾选“Hermes COO 智能拆解与分发”后，Hermes 解析目标，结合五大 Worker 矩阵（Codex、Antigravity、Grok、Claude、DeepSeek）输出结构化 `DISPATCH_PLAN`；
  - 控制中枢（AI CEO）自动提取子任务、绑定 `parentTaskId` / `planId` 并入账执行，任务看板联动呈现分发链路与子任务执行状态。
- **西方经典油画库扩容与防疲劳动态轮转**：
  - 彻底打破以往仅循环 4~5 张画作（倒牛奶的女仆、雾海旅人、自画像等）的审美疲劳瓶颈；
  - 扩充 7 张高清晰度、涵盖浪漫主义/印象派/静谧主义的馆藏级名画资产入库（德加《苦艾酒馆》、弗里德里希《橡树林中的修道院》、哈默斯霍伊《室内》、透纳《雨，蒸汽和速度》、维米尔《地理学家》、伦勃朗《沉思的哲学家》、莫奈《撑阳伞的女人》）；
  - 落地结构化名画总账本（`assets/studio/art_library.json`）与双语元数据（情感/哲学标签、色盘预设、智能裁切框与展签文字）；
  - 交付 Node 与 Python 双版本智能选画与防疲劳轮转引擎（`src/content/artRegistry.js`、`小红书/art_selector.py`），支持根据主题情绪加权匹配与历史冷却窗口（N 篇内绝不重复），`studio_batch.py` 全面无缝接入。

## Phase 1 — Shuzhai content loop
Target loop:
book -> analysis -> topic selection -> Xiaohongshu content -> image generation/layout -> scheduled publishing -> traffic data.

Acceptance:
- stable automated output,
- publishable visual quality,
- real traffic validation.

## Phase 2 — Trend Radar
Detect high-performing themes from X/Twitter, Xiaohongshu and other sources; feed validated themes into original content production.

## Phase 3 — MY_BRAIN / IP Layer
Store founder judgments and inject them into generated content so the account builds recognizable personal IP rather than pure aggregation traffic.

## Phase 4 — multi-agent routing
Use Codex, Antigravity, Grok and future agents according to their strengths and available quota.

## Do not do yet
- Build a huge generic orchestration platform before Phase 1 works.
- Add many agents simply because they exist.
- Spend founder time learning infrastructure that agents can build and maintain.
