# HANDOFF.md

**Agent**: Grok Build  
**When**: 2026-09-03  
**Latest**: review-fix (BLOCKER/P0/P1)

- 明文手机口令已从交接文档删除，并轮换 `data/phone-access-token`。手机访问需重新配对。
- `GET /api/secretary/brief` 读账本 `readOnly`，缺文件不写盘；金额不进 brief。
- 下载 GET 只读已有口令，绝不创建 token 文件；使用 `src/files/download.js`。
- 报告摘要含 agent/ok/error，不含 stdout/prompt。
- 文件列表去掉 `absolutePath`。
- 测试：`npm test` 173/173 pass。

**Phase 5**: 仍暂缓

## Founder decisions applied
1. Phase 5 postponed  
2. Existing 10 active memories grandfathered  
3. Stop Hermes gemini-proxy; ¥50 paid gate on Hermes+DeepSeek  
4. Antigravity dangerous-bypass unchanged  
5. Connect Grok Bot.exe (launch + localhost inbound; canDispatch=false)  
6. New memory confirm → testing

## What I did
- Phase 0: honest secretary badge/copy (grok -p ≠ Grok Bot.exe)
- Phase 1: OS snapshot in grok -p prompt + GET /api/secretary/os-snapshot
- Phase 2: Learning events + hooks on approve/reject/task finish
- Phase 3: confirm → testing; 3 positive evidence → active
- Phase 4: reused files/registry; added delivery outbox; approve package → allowed
- Hermes: force `--provider deepseek`; CostGuard always meters Hermes
- Desktop bot: probe/open/inbound

## Files
New: `src/learning/*`, `src/delivery/outbox.js`, `src/secretary/desktopBot.js`, `test/learning.test.js`  
Modified: memory, chat, brief, costGuard, hermes bridge, health, config.js, billing yaml, server.js, public app/html, tests

## Tests
Run `npm test` after this handoff.

## Not done
- Phase 5 workforce fallback order
- Grok Bot.exe does not yet poll OS snapshot by itself (we expose inbound+snapshot; no asar patch)
- Did not edit `config.json` (already provider=deepseek) or Antigravity permissionMode

## Need Founder
Nothing blocking. Optional: confirm Hermes CLI itself has DeepSeek configured (`hermes status`).
