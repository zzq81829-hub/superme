# ARCHITECTURE

```
User
  -> Control Center (this repo, :3210)
  -> Hermes Bridge  (CEO / orchestration)
  -> Worker adapters (subscription CLIs, DeepSeek API only)
  -> Local business tools (书斋 / 星选 / 原点 / …)
```

Layer 1 is `superme`. Layer 2 is installed Hermes (`hermes chat --query-file`). Layer 3 workers spawn CLIs. Layer 4 tools are sibling folders, never deleted.

Do not reimplement Hermes terminal/browser/memory/skills/computer-use inside this repo.
