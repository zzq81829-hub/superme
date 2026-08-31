import test from "node:test";
import assert from "node:assert/strict";
import { listLocalTools } from "../src/tools/localTools.js";

test("local business tools are registered and not deleted", () => {
  const tools = listLocalTools();
  assert.equal(tools.every((t) => t.keep), true);
  assert.ok(tools.some((t) => t.id === "shuzhai"));
  assert.ok(tools.some((t) => t.id === "xingxuan"));
});
