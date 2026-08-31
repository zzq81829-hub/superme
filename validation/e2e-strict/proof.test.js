import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("strict verifier proof file", () => {
  assert.equal(fs.readFileSync(new URL("PROOF.txt", import.meta.url), "utf8"), "CODEX_STRICT_E2E");
});
