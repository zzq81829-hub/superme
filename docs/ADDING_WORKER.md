# ADDING A WORKER

1. Add CLI resolver in `src/adapters/resolveCommand.js` if needed.
2. Add `runX` adapter using `processRunner` + `subscriptionEnv` (or DeepSeek env only).
3. Wire `runAgent`.
4. Add billing row (`api_allowed: false` unless DeepSeek).
5. Add health in `src/workers/health.js`.
6. Add Cost Guard chain position if it is a coding fallback.
7. Dry-run unit test. Live test in `validation/`.
8. Do not add OpenAI/Anthropic/xAI/Gemini API workers.
