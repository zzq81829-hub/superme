# BILLING POLICY

Source of truth: `config/billing-policy.yaml`.

Subscription CLI only: Codex, Claude, Antigravity, Grok Build, Grok.  
API allowed: DeepSeek (cheap).  
Forbidden: OpenRouter, OpenAI API, Anthropic API, xAI API, Gemini API.

If a subscription CLI is logged out or quota-limited: mark AUTH_REQUIRED / QUOTA_LIMITED / SUBSCRIPTION_UNAVAILABLE and hop. Do not silently bill another vendor.
