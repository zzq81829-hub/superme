import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { listSafeComputerFiles, readSafeComputerText } from "../src/access/computerRead.js";

test("computer reader blocks private paths and redacts money and identifiers", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "computer-read-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "notes.txt"), "预算 ¥123，电话 13800138000");
  fs.mkdirSync(path.join(root, "bank"));
  fs.writeFileSync(path.join(root, "bank", "account.txt"), "private");
  const roots = { desktop: root };

  assert.deepEqual(listSafeComputerFiles({ rootName: "desktop", roots }).map((item) => item.name), ["notes.txt"]);
  assert.equal(readSafeComputerText({ rootName: "desktop", relativePath: "notes.txt", roots }), "预算 [金额已隐藏]，电话 [手机号已隐藏]");
  assert.throws(() => readSafeComputerText({ rootName: "desktop", relativePath: "bank/account.txt", roots }), /Privacy policy/);
});
