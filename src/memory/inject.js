import { listActive } from "./store.js";

export function buildMemoryContext({
  project,
  projectScope,
  domain,
  includeTesting = true,
  maxItems = 10
} = {}, options = {}) {
  try {
    const proj = project || projectScope;
    const memories = listActive({ project: proj, domain, includeTesting }, options).slice(0, maxItems);
    if (!memories.length) return "";

    const lines = [
      "FOUNDER MEMORY (current effective only):",
      "---"
    ];

    memories.forEach((m, idx) => {
      const scopeStr = Array.isArray(m.projectScope) ? m.projectScope.join(", ") : "*";
      const isTesting = m.status === "testing";
      const trial = isTesting ? " | Status: TESTING (试用中，证据不足，不得当作永久人格)" : "";
      const prefix = isTesting ? "[试用中，证据不足 / testing] " : "";

      lines.push(`${idx + 1}. ${prefix}[${m.type.toUpperCase()}] ${m.title}`);
      lines.push(`   Scope: ${scopeStr} | License: ${m.license} | Sensitivity: ${m.sensitivity}${trial}`);
      lines.push(`   Content: ${m.content}`);
      if (m.license === "understand_only") {
        lines.push("   Constraint: [UNDERSTAND_ONLY] This memory is strictly for background understanding. DO NOT quote directly in public copy, DO NOT output as public-facing text, and DO NOT attribute as verbatim founder words.");
      } else if (m.license === "influence_or_paraphrase") {
        lines.push("   Constraint: [INFLUENCE_OR_PARAPHRASE] May influence tone and structure or be paraphrased, but do not present as verbatim citation.");
      }
    });

    lines.push("---");
    return lines.join("\n");
  } catch (error) {
    console.error("Failed to build memory context:", error);
    return "";
  }
}
