import test from "node:test";
import assert from "node:assert/strict";
import { extractBriefHighlights } from "../src/briefs/extract.js";

test("brief extraction keeps founder requirements and ignores assistant suggestions", () => {
  const result = extractBriefHighlights(`
用户：我希望首页更像一个安静的董事会，不要游戏风
助手：可以使用霓虹渐变和动效。
用户：以后所有发布都必须先经过我确认
`);

  assert.equal(result.highlights.length, 2);
  assert.match(result.proposedContent, /安静的董事会/);
  assert.match(result.proposedContent, /先经过我确认/);
  assert.doesNotMatch(result.proposedContent, /霓虹渐变/);
});

test("brief extraction works on unlabeled free-AI text and rejects secrets", () => {
  const result = extractBriefHighlights(`
我希望所有页面保持克制、高级的视觉风格。
我的 API key: sk-123456789012345678901234
以后任务先做可验证的最小闭环。
`);

  assert.equal(result.highlights.length, 2);
  assert.ok(result.ignoredCount >= 1);
  assert.doesNotMatch(result.proposedContent, /API key|sk-/i);
});
