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
- **DeepSeek 每月 30 元硬闸与到限提醒**：Hermes+DeepSeek 统一月度账本 (`data/billing`)、每月 30 元硬停（到限 Cost Guard 跳过或报 HUMAN_ACTION_REQUIRED）、预扣与防并发防双记、到限面板置顶横幅提醒、线下充值后手动登记额度均已落地；绝不发起真实扣款。
- **内容三层与冻结发布包**：素材事实、候选表达、观点卡片（三级许可与快照）三层架构落地；`understand_only` 严禁公开与原话引用；发布包冻结锁定哈希，改动任一对外字段立即令审批失效并退回草稿；经创始人显式批准后进入 `ready_manual` 供线下发帖；`/send` 恒返回 403 严禁自动外发。
- **ChatGPT 浏览器提取桥**：Tampermonkey 脚本 (`public/bridge/chatgpt-extract.user.js`) 与服务端 `/api/bridge/chatgpt/extract` 落地；仅提炼 user 轮次实质判断，零全文落盘；生成候选卡需在控制台确认生效，自动入库未开放；无任何付费模型 API。
- **Grok Bot 秘书协议与本机收件箱**：真实只读探测器（`src/secretary/probeGrokBot.js`）证实当前 `grok.exe` 为 Grok Build TUI，无独立 bot 控制接口，如实标记为 `UNKNOWN_CONTROL_INTERFACE` 且 `canDispatch: false`；本机秘书收件箱（`/api/secretary/inbox`）已落地，支持收集意图并安全生成草稿任务或记忆候选，严格零自动 dispatch、零自动 approve、零自动 confirm。

### 2026-09-01 Founder-facing V1 refinement
- 完成任务现在生成创始人可读产物：控制台显示可直接使用的能力，不再把 Worker 日志或源码当作产品；已完成文件显示可点击绝对路径。
- 小红书发布包显示图文与文案文件位置，并可直接在本机打开。
- AI CEO 内置 `grilling` 决策树技能；Hermes 仍为 COO，职责口径见 `founder_os/projects/AI_CEO.md`。
- 新增电脑只读安全入口，仅覆盖常用用户资料夹，阻止隐私/凭据/金融路径，并在读取文本时隐藏金额和常见个人标识。
- Hermes 已通过官方更新器升级到最新主线 `e721b03f`，Windows Desktop 客户端已重建；控制台按钮和 Windows 桌面快捷方式都直接打开原生 Desktop 客户端。

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
