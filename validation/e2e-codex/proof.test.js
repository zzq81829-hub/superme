import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

test("CODEX proof file", () => {
  assert.equal(fs.readFileSync(new URL("./PROOF.txt", import.meta.url), "utf8").trim(), "CODEX_E2E_T1");
});
