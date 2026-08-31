# GROK BOT (私人秘书协议)

## 1. 状态与探测证据 (Probe Evidence)
- **当前状态**：`EXPERIMENTAL / UNKNOWN_CONTROL_INTERFACE`（控制接口未验证，仅保留秘书职位，无调度权）。
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
  1. Grok Bot / 创始人口述通过 `/api/secretary/inbox` 提交原始意图；
  2. 本机控制系统接收并暂存至 `data/secretary/inbox/*.json`；
  3. 系统将意图安全转换为**任务草稿 (draft task)** 或 **记忆候选 (memory candidate)**；
  4. **绝不自动派发执行 (dispatchTask)**，**绝不自动批准高风险动作**，**绝不自动确认记忆**；
  5. 待创始人在线下或面板中手动确认后，再由本机附加预算、记忆与权限派发给 Hermes (COO) 编排执行。

---

## 3. 三者明确区分 (Strict Separation)
- **Grok**：xAI 对话模型（通过 `grok.exe` 运行研究/调研）；
- **Grok Build**：编码/工程构建工具（通过 `grok.exe` 运行 `-p` 单轮构建）；
- **Grok Bot**：私人秘书 / 人格入口（当前无独立控制接口，仅做收件箱意图对接，绝不混淆为一个进程）。
