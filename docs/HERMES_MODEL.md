# Hermes effective model

AI Founder OS now dispatches the `hermes` COO worker with the founder-approved Gemini route:

- Provider: `custom:gemini-proxy`
- Model: `gemini-flash-3.7`
- Reasoning: `high`

The separate `deepseek` worker keeps its explicit `deepseek` provider. This lets the founder choose Hermes Gemini orchestration without silently changing a task that explicitly requested DeepSeek.

The Gemini proxy may still return an upstream quota `429`; that is a provider-pool limit, not a task failure or a permission approval. The Gemini route is not blocked by the separate DeepSeek monthly ledger. The dashboard reports the effective Hermes provider when the local `hermes status` probe exposes it.
