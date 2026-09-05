# GROK BOT (私人秘书协议)

## 1. 状态与探测证据 (Probe Evidence)
- **当前状态（三件套，禁止混写）**：
  - 外部 `Grok Bot.exe`：桌面 Electron。OS 可探测/启动，localhost inbound 可投递草稿；**canDispatch 恒为 false**。
  - 本机秘书聊天：`grok.exe -p`（Grok Build TUI 一次性对话）。
  - CLI 控制协议：`probeGrokBot()` 仍为 `UNKNOWN_CONTROL_INTERFACE`（`grok --help` 是 Grok Build TUI）。
- **实测证据 (Empirical Evidence)**：
  - 探测命令：`grok --help`
  - 探测输出摘要：`Grok Build TUI - Usage: grok [OPTIONS] [PROMPT] [COMMAND]`
  - 探测结论：本机安装的 `grok.exe` 是用于编码与交互的 **Grok Build TUI**（由 Grok 与 Grok Build 共享）；系统中**不存在独立的 Grok Bot 守护进程或非交互式 Bot 控制协议接口**。
- **权限硬约束**：
  - `canDispatch`: **恒为 false**（绝无派工或调度权）；
  - `canSubmit`: **false**（因无已验证非交互 Bot 接口，当前仅支持通过本机 Dashboard/手动提交意图）；
  - `required`: **false**（Cost Guard 自动跳过，不影响公司主流程）。

---

## 2. 职责与权力边界 (Duties & Authority Boundaries)
- **定位**：创始人私人秘书 / 人格入口（陪伴、收集想法、提醒、汇报、接收指令）。
- **流程规范**：
  1. Grok Bot / 创始人口述通过 `/api/secretary/chat` 或 `/api/secretary/inbox` 提交原始意图；
  2. 本机控制系统 (AI CEO) 统一登记任务账本并进行风控判级；
  3. **普通/常规任务**：由 OS 自动排队并派发给 **Hermes (COO)** 进行拆解与调度编排；
  4. **高风险任务**：涉及对外公开发布（小红书等）、付费资金、破坏性删除的操作，**OS 物理拦截在待审批队列 (awaiting_approval)**，等待创始人签字放行，绝不静默放行；
  5. 记忆偏好与候选表达保留在待确认池，由创始人确认入库；
  6. Grok Bot 本身永无独立执行权，所有权力与账本由 OS 控制中枢统一兜底。

---

## 3. 三者明确区分 (Strict Separation)
- **Grok**：xAI 对话模型（通过 `grok.exe` 运行研究/调研）；
- **Grok Build**：编码/工程构建工具（通过 `grok.exe` 运行 `-p` 单轮构建）；
- **Grok Bot**：私人秘书 / 人格入口（当前无独立控制接口，仅做收件箱意图对接，绝不混淆为一个进程）。
