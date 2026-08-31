import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

test("Antigravity proof file", () => {
  assert.equal(fs.readFileSync(new URL("./PROOF.txt", import.meta.url), "utf8").trim(), "AGY_E2E_T3");
});
