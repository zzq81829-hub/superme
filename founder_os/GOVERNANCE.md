# 公司治理结构与执行章程 (Company Governance & Authority)

## 1. 组织架构图 (Single Source of Truth)

```
创始人 (Founder / 你)
  │
  ├──► Grok Bot（私人秘书 · 三件套勿混）
  │      - 本机聊天：OS 秘书面板 grok -p（订阅 CLI，无执行权）。
  │      - 外部 Grok Bot.exe：仅可打开；未证明主动回连前不算接入；canDispatch 恒为 false。
  │      - 人格文件：`founder_os/GROK_BOT_PERSONA.md`。
  │      - 职责：陪伴、收集想法、提醒与汇报、接收并整理指令。
  │      - 权限边界（永无直接系统执行权）：不直接改文件、不跑命令、不发布、不调付费 API；动作出口 = 由 OS 控制中枢登记任务账本并自动派发 Hermes (COO) 调度编排（高风险任务拦截在审批队列）。
  │      - 铁律：严禁绕过本机控制系统直接联系 Hermes 或其他 Worker；必须由 OS 控制中枢（AI CEO）掌管任务账本、预算守卫与风控审批；隐私与金额内容不读不存。
  │      - 调教：面板「🎛 调教人格」直接编辑人格文件；对话中把 Grok Bot 某条回复点「设为规则」自动追加到人格「调教记录」。
  │      - 分工边界：代码 / 渲染 / 重构 / 研究等工程活只走 Grok / Grok Build 等派工 Worker，秘书线不承接；Grok Bot 也绝不伪装成工程 Worker 接派工任务。
  │
  ▼
本机控制系统 / Control Center (:3210) 【权力与账本 · AI CEO】
  - 核心定义：AI CEO 是本机控制系统本身，不是任何单一大模型。
  - 核心职责：目标管理、统一记忆库、权限守卫、成本预算、审批队列、任务状态唯一事实源。
  │
  ▼
Hermes (COO / 首席运营官)
  - 核心职责：拆解任务目标、编排工作流、派发任务给各专业 Worker、跟进执行、汇总结果并向控制中枢汇报。
  │
  ▼
专业 Worker 团队 (Specialized Workers)
  - Codex (架构与实现)、Grok / Grok Build (工程执行)、Antigravity (多文件修改与重构)、Claude (代码审查)、DeepSeek 等。
  - **Worker 模型分配（2026-09-03 更新）**：Codex = gpt-5.6-luna（reasoning high）；Antigravity = gemini-3.8-flash（high，2026-09-03 升级，强化长周期工程与微步推理）；Claude 反代 = claude-sonnet-4-6（经 Antigravity 反向代理）；Grok = grok.com 默认；Hermes/DeepSeek = DeepSeek。所有 Worker 派工强制注入马尾辫 ponytail skill，内容生产统一受 30 秒停留法则与 5 大打磨支柱约束。
```

---

## 2. 三级汇报机制 (Three-Tier Reporting System)

1. **一级汇报（立即打断 Founder）**：
   - 对外公开发布内容（小红书、X/Twitter、外部 API 等）；
   - 付费超限或触发成本守卫警戒线；
   - 不可逆操作（物理删除核心数据、重置重要配置）；
   - 权限越界与安全风险；
   - 最高业务目标或治理原则变更。
2. **二级汇报（每日简报 / Daily Briefing）**：
   - 每日汇总已完成任务、执行耗时与成本、实验进展及待审批决策列表。
3. **三级汇报（仅记录面板 / Dashboard Only）**：
   - 常规步骤流转、Worker 执行日志、自动化验收通过状态与缓存更新。

---

## 3. 审批队列与安全拦截
 
- **高风险操作必须停留在审批队列（已落地）**：五大高风险一级打断拦截（发布、付费、不可逆删除、安全越界、最高目标变更）、稳定 Payload 哈希校验、审批前零 dispatch、内容修改或改派审批立即失效已全部落地。小红书发布包经创始人点「批准」后由控制中枢经本机 xhs-mcp 外发。

---

## 4. 记忆与发布原则声明

### 记忆原则 (Memory Principle)
- 记忆权属于本机控制系统，统一持久化创始人判断、品味偏好与决策经验；
- 各 Worker 仅按需读取生效上下文片段，严禁任何单一模型持有私有孤立权威记忆；
- 结构化记忆对象、候选确认入库、版本追踪、Prompt 安全注入以及 ChatGPT「提取本次对话」浏览器桥已落地（仅在内存提炼生成待确认候选，绝不落盘保存完整聊天记录，自动入库未开放）。

### 发布原则 (Publishing Principle)
- 最终发布权 100% 归创始人。Worker / Agent 不得自行外发；`/send` 仍返回 403。
- **内容三层与冻结发布包（已落地）**：底层素材事实、候选表达与观点卡片三层清晰分立；`understand_only` 严禁进入公开面与原话引用；冻结发布包必须经创始人显式批准锁定哈希。
- **批准即发布（2026-09-03）**：创始人点「批准」= 授权外发。控制中枢经本机已有 `工作流/tools/xhs-mcp` 把图文发到小红书。未上号时停在 `approved`，扫码后再点「立即发布」。Agent 仍不能绕过审批。

---

## 5. 资源与成本原则 (Resource & Cost Principle)

- **会员额度优先**：优先使用已有订阅会员（Codex、Antigravity、Grok Build、Grok、Claude 本地代理、Grok Bot 秘书线——与 Grok 共用同一 grok.com 订阅）。
- **DeepSeek / Hermes 50 元硬闸（已落地）**：承担批量低成本工作；Hermes 与 DeepSeek 统一按月硬控 50 元人民币 (`data/billing`)；gemini-proxy 已停用；到限即停并置顶横幅提醒，严禁自动扣款；是否充值由创始人线下决定后登记额度。
- **严禁未授权外部付费 API**：禁止任何静默调用 OpenAI / Anthropic / xAI / Gemini / OpenRouter API。

---

## 6. 读取权限边界 (Read Scope)

- **广域读取授权**：系统与所有 Worker 可读取本机任意文件与目录，用于完成创始人指派的任务，除下述两类外无需逐次询问。
- **禁止读取隐私**：密钥/Token/密码/私钥（`.ssh`、`*.pem`、`.env` 密钥、`auth.json`）、浏览器历史与 Cookie、私人聊天/通讯录/私人照片、身份与医疗信息。
- **禁止读取金额**：银行卡号/支付密码/支付凭证、账单与流水、账户余额明细、财务税务文件（除非创始人明确要求）。
- **读取 ≠ 写入**：删除、修改、发布、付费仍走一级审批队列与成本守卫，不受本授权影响。
- **存疑即停**：无法判断是否属隐私/金额的文件，先停手询问创始人，不读。
- 边界全文见 `founder_os/READ_SCOPE.md`（每次派工自动注入 Worker 提示词）。
