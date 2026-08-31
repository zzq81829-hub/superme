# BILLING POLICY

Source of truth: `config/billing-policy.yaml`.

Subscription/session CLI only: Codex, Antigravity, Grok Build, Grok. Claude may use the founder-approved local Antigravity reverse proxy at `127.0.0.1:8045`; this is an explicit exception to the normal Anthropic-key rejection rule and is only used through `claude -p`.
API allowed: DeepSeek (cheap).  
Forbidden: OpenRouter, OpenAI API, Anthropic API, xAI API, Gemini API.

If a subscription CLI is logged out or quota-limited: mark AUTH_REQUIRED / QUOTA_LIMITED / SUBSCRIPTION_UNAVAILABLE and hop. Do not silently bill another vendor.

If the Claude proxy is not listening, mark Claude `ON_DEMAND`, skip it, and continue. The founder starts the Claude terminal/proxy only when Claude is needed.
