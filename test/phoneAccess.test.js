import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

test("phone access launcher uses an explicit one-time token boundary", () => {
  const source = fs.readFileSync(new URL("../scripts/start-phone.js", import.meta.url), "utf8");
  assert.match(source, /AI_FOUNDER_OS_PHONE_TOKEN/);
  assert.match(source, /randomBytes\(18\)/);
  assert.match(source, /AI_FOUNDER_OS_HOST: \"0\.0\.0\.0\"/);
});
