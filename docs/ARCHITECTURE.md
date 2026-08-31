# ARCHITECTURE

```
Founder (User)
  -> Grok Bot (Personal Secretary / Persona interface; experimental, no dispatch authority)
  -> Control Center / AI CEO (this repo, :3210 - power, goals, memory, permissions, ledger)
  -> Hermes Bridge (COO / workflow orchestration)
  -> Worker adapters (subscription CLIs, DeepSeek API only)
  -> Local business tools (书斋 / 星选 / 原点 / …)
```

Layer 1 is Founder & Secretary interface. Layer 2 is Local Control Center (`superme`, AI CEO / Control Plane). Layer 3 is installed Hermes COO (`hermes chat --query-file`). Layer 4 workers spawn CLIs. Layer 5 tools are sibling folders, never deleted.

Do not reimplement Hermes terminal/browser/memory/skills/computer-use inside this repo.
