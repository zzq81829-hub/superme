import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, chooseAgent } from "../src/router.js";

test("router respects an explicit agent", () => {
  assert.equal(chooseAgent({ agent: "antigravity", title: "review", description: "" }), "antigravity");
});

test("router sends review work to Claude", () => {
  assert.equal(chooseAgent({ agent: "auto", title: "code review", description: "review the design" }), "claude");
});

test("router sends architecture work to Codex", () => {
  assert.equal(chooseAgent({ agent: "auto", title: "检查代码架构", description: "inspect the design" }), "codex");
});

test("router sends implementation work to Antigravity", () => {
  assert.equal(chooseAgent({ agent: "auto", title: "实现登录页", description: "build the feature" }), "antigravity");
});

test("router sends the Phase 0 demo prompt to Antigravity", () => {
  assert.equal(chooseAgent({
    agent: "auto",
    title: "检查这个项目有什么问题。",
    description: "检查这个项目有什么问题。"
  }), "antigravity");
});

test("prompt contains task intent, project path, and safety workflow", () => {
  const prompt = buildPrompt({ title: "Test task", description: "Do the work" }, "C:/project");
  assert.match(prompt, /PROJECT PATH: C:\/project/);
  assert.match(prompt, /TASK: Test task/);
  assert.match(prompt, /Do the work/);
  assert.match(prompt, /Do not publish, purchase/);
});
