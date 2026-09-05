import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { readAgentReachDirective, shouldUseAgentReach } from "../src/skills/agentReach.js";
import { buildPrompt } from "../src/router.js";

function withTempSkill(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-reach-skill-"));
  const file = path.join(dir, "SKILL.md");
  fs.writeFileSync(file, "---\nname: agent-reach\n---\n\nFETCH WITH VERIFIED SOURCES.", "utf8");
  return Promise.resolve(run(file)).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

test("Agent Reach is injected only for internet research tasks", async () => {
  await withTempSkill((skillFile) => {
    const options = { skillFile, command: "C:/agent-reach.exe" };
    const researchTask = { title: "调研小红书趋势", description: "搜索近期公开资料" };
    assert.equal(shouldUseAgentReach(researchTask), true);
    assert.match(readAgentReachDirective(researchTask, options), /互联网只读能力层/);
    assert.equal(readAgentReachDirective({ title: "修复按钮", description: "只改本地 CSS" }, options), "");
  });
});

test("buildPrompt gives research workers the Agent Reach skill and safety boundary", async () => {
  await withTempSkill((skillFile) => {
    const previous = process.env.AGENT_REACH_SKILL_FILE;
    process.env.AGENT_REACH_SKILL_FILE = skillFile;
    try {
      const prompt = buildPrompt({ id: "reach-1", title: "全网调研", description: "找行业趋势" }, "C:/p");
      assert.match(prompt, /FETCH WITH VERIFIED SOURCES/);
      assert.match(prompt, /Never post, comment, like, upload/);
    } finally {
      if (previous === undefined) delete process.env.AGENT_REACH_SKILL_FILE;
      else process.env.AGENT_REACH_SKILL_FILE = previous;
    }
  });
});
