# AI Founder OS V1

这是本机 **AI Company Control Center**（老板台）。CEO 是已安装的 Hermes，不是再造一套运行时。

这是一个可在 Windows 本机运行的 AI 任务控制台。

它的目的不是一次做出“贾维斯”，而是先解决最痛的问题：

> 你说需求 -> 创建任务 -> 自动分配给 Codex / Antigravity -> 执行 -> 保存结果

## 为什么先这么做
Codex 已经是可在本机运行的跨平台软件 Agent；Antigravity CLI 也面向终端/headless execution。V1 因此优先通过 CLI/文件调度，不依赖脆弱的网页点击。

## V1 已包含
- 本地 AI CEO Dashboard
- 任务持久化
- 自动/手动 Agent 路由
- Codex `codex exec` 非交互适配与 JSONL 结果解析
- Antigravity `agy --print` headless 适配与 JSON 结果解析
- 默认 `dryRun=true` 安全预演
- 每任务执行日志、超时、输出上限和错误诊断
- Founder OS / AGENTS.md
- 书摘项目方向
- Windows 启动脚本

## 第一次启动（Windows）
1. 安装 Node.js。
2. 解压本项目。
3. 双击 `安装依赖.bat`。
4. 双击 `启动_AI公司.bat`。
5. 浏览器打开 `http://localhost:3210`。

默认是**安全预演模式**，不会真的调用 CLI。

Dashboard 中点击“创建并执行”后会自动完成：创建任务 -> 路由 Agent -> 执行 -> 保存结果。

## 配置
第一次启动会把 `config.example.json` 复制成 `config.json`。

重点字段：

```json
{
  "dryRun": true,
  "host": "127.0.0.1",
  "workspaceRoot": "",
  "execution": {
    "timeoutMs": 600000,
    "maxOutputBytes": 2097152
  }
}
```

服务默认只监听本机 `127.0.0.1`，不会暴露到局域网。`workspaceRoot` 为空时使用 AI Founder OS 当前目录。也可以在 Dashboard 的“项目路径”中为单个任务指定真实项目。

只有在 CLI 已经确认可用、测试通过后，再把 `dryRun` 改为 `false`。执行模式下，Codex 默认使用 `workspace-write`；Antigravity 默认使用 `accept-edits` 和 CLI sandbox。不要配置任何跳过权限或完全放开沙箱的危险参数。

### CLI 参数
V1 使用本机 `--help` 验证过的调用方式：

```bash
codex exec --ephemeral --json --sandbox workspace-write --skip-git-repo-check -
agy --mode accept-edits --output-format json --model claude-sonnet-4-6 --print="任务提示词"
```

本机默认 Gemini 会被 `User location is not supported` 拒绝。V1 因此默认把 Antigravity 调到 `claude-sonnet-4-6`，失败后再试 `gpt-oss-120b-medium`。Windows 上 `--sandbox` 会把工作区变成空 scratch，所以默认关掉沙箱，并用 `--add-dir` 挂上项目路径。`codex` 不在 PATH 时，adapter 会解析 `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`。

`config.json` 中 `agents.<name>.args` 仅用于附加当前 CLI 支持的额外参数。

### 日志
每次执行都会保存到 `data/reports/`：

- `*-codex.json`：Codex 包装器执行记录。
- `*-antigravity.json`：Antigravity 包装器执行记录。
- `*-antigravity-cli.log`：Antigravity 原生诊断日志。

任务提示词不会出现在包装器的命令参数日志中。

## 验证

```bash
npm test
npm run smoke:codex
npm run smoke:antigravity
```

前者不调用外部 Agent；两个 smoke 命令分别执行一次只读真实调用。

## V1 之后再做
- 自动测试 / Reviewer loop
- 任务拆分
- 手机入口
- Grok/MCP
- 书摘的 Trend Radar / MY_BRAIN / IP Layer

不要提前做这些，先让“自动派给 Codex / Antigravity”真正跑通。
