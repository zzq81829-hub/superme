import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { readPonytailDirective } from "../src/skills/ponytail.js";
import { buildPrompt } from "../src/router.js";

function tempSkill(content) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ponytail-test-"));
  const file = path.join(tmp, "SKILL.md");
  fs.writeFileSync(file, content, "utf8");
  const prev = process.env.PONYTAIL_SKILL_FILE;
  process.env.PONYTAIL_SKILL_FILE = file;
  return {
    tmp,
    restore() {
      process.env.PONYTAIL_SKILL_FILE = prev;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };
}

test("ponytail directive embeds the skill body and strips frontmatter", () => {
  const env = tempSkill("---\nname: ponytail\ndescription: lazy\n---\n\nBE LAZY. Stdlib before custom code. One line before fifty.");
  try {
    const d = readPonytailDirective();
    assert.match(d, /MANDATORY SKILL/);
    assert.match(d, /ponytail/);
    assert.match(d, /BE LAZY/);
    assert.doesNotMatch(d, /^---/m);
  } finally {
    env.restore();
  }
});

test("ponytail directive is empty when no skill file exists", () => {
  const prev = process.env.PONYTAIL_SKILL_FILE;
  process.env.PONYTAIL_SKILL_FILE = path.join(os.tmpdir(), "definitely-missing-SKILL.md");
  try {
    assert.equal(readPonytailDirective(), "");
  } finally {
    process.env.PONYTAIL_SKILL_FILE = prev;
  }
});

test("buildPrompt honors the founder decision to stop mandatory ponytail injection", () => {
  const env = tempSkill("---\nname: ponytail\n---\n\nSIMPLEST WORKING SOLUTION. YAGNI. One line before fifty.");
  try {
    const prompt = buildPrompt({ id: "t-1", title: "X", description: "Y" }, "C:/p");
    assert.doesNotMatch(prompt, /MANDATORY SKILL \(马尾辫 \/ ponytail\)/);
    assert.doesNotMatch(prompt, /SIMPLEST WORKING SOLUTION/);
  } finally {
    env.restore();
  }
});
