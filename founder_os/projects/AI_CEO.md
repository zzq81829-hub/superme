# Project: AI CEO / AI Company
 
## Governance & Roles
- **AI CEO**: 本机控制系统 (Local Control Center, :3210) 掌管权力与账本（目标、记忆、权限、预算、审批、状态）。
- **Personal Secretary**: Grok Bot (人格入口、陪伴、收集想法、汇报；当前接口未验证，无直接调度权)。
- **COO**: Hermes (任务拆解、流程编排、Worker 调度与执行跟进)。
- **Workers**: Codex、Grok、Antigravity、DeepSeek 等专业代码与执行 Worker。

## 角色与边界（文件确认后的唯一口径）

| 角色 | 是谁 | 负责什么 | 不负责什么 |
|---|---|---|---|
| Founder | 你 | 方向、品味、高风险审批、最终商业判断 | 日常拆任务和盯执行 |
| AI CEO | 本机 Control Center（本仓库，`:3210`） | 理解需求、目标/记忆/权限/预算/审批、任务与产物唯一账本 | 亲自完成所有专业工作 |
| 私人秘书 | Grok Bot | 接收想法、陪伴、提醒、汇报 | 无调度权，不可绕过 CEO |
| COO | Hermes | 拆解复杂目标、编排流程、派 Worker、跟进和汇总 | 不是 CEO，不掌握最终审批和账本 |
| 架构与实现 | Codex | 架构、复杂实现、故障定位、机器验收 | 未经批准不发布、不付费 |
| 工程执行 | Antigravity / Grok Build | 明确任务的多文件修改、实现和返工 | 不改变最高目标与治理 |
| 研究 | Grok | 调研、趋势、外部信息整理 | 不直接修改产品或发布 |
| 审查 | Claude | 代码与方案审查、风险发现 | 当前本机代理关闭时按需跳过 |
| 低成本处理 | DeepSeek（经 Hermes） | 摘要、改写、分类、批处理 | 与 Hermes 共用每月 ¥30 硬闸 |

AI CEO 已内置 `.agents/skills/grilling/SKILL.md`。创始人说“拷打我”时，CEO 必须先用决策树分轮澄清，确认共同理解后再执行。

## 创始人可见产物
- 任务完成后，产物栏优先显示“你现在可以做什么”，不把源码和内部日志当产品。
- 完成的文件或文件夹显示绝对路径，并可从控制台点击在本机打开。
- 小红书图文的封面、内页、发布文案和审批说明必须作为可点击产物出现。

## 电脑读取范围
- V1 可只读检索 `Desktop / Documents / Downloads / Pictures / Videos / Music`。
- AppData、凭据、密钥、令牌、银行、账单、发票、税务、身份证件等路径始终拒绝。
- 文本中的金额、手机号和身份证号在交给 AI 前自动隐藏；不提供整盘无边界读取。

## Goal
The founder gives intent once. The system routes work to the best available agent, tracks execution, retries failures and returns only material decisions/results.

## V1
Local dashboard + deterministic router + Codex adapter + Antigravity adapter + persistent task files.

## V2
Add richer project state, automatic validation, review loops, and safe remote/mobile entry.

## V3
Add browser/computer workers only where CLI/API/MCP/file handoffs are insufficient.

## Design principle
Do not solve a reliable CLI/API problem with fragile GUI clicking.

## 2026-09-05 账号池与工作台验收
- Antigravity 与 Codex 各自最多保留 A/B 两个账号槽位。只有经过登录检查且状态为 `AVAILABLE` 的槽位才能参与派工；B 未验证时不得把 A 的登录或额度冒充为 B。
- Antigravity B 需要创始人在官方软件中手动切换后检查；Codex B 必须绑定独立 `CODEX_HOME` 后检查。凭据、令牌、环境变量不进入控制台 API 或 UI。
- Founder OS 工作台已完成桌面/手机/平板 UI 验收和实际 Codex 文件交付验收；本地控制平面仍是唯一事实源。
- 创始人已取消强制 ponytail 注入，派工提示不再包含该强制指令。
