import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { getReadScope } from "../src/policy/readScope.js";
import { buildPrompt } from "../src/router.js";

test("read scope falls back to the built-in boundary when no file exists", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "readscope-test-"));
  const prev = process.env.READ_SCOPE_FILE;
  process.env.READ_SCOPE_FILE = path.join(tmp, "READ_SCOPE.md");
  try {
    const scope = getReadScope();
    assert.equal(scope.exists, false);
    assert.equal(scope.fallback, true);
    assert.match(scope.content, /隐私/);
    assert.match(scope.content, /金额/);
  } finally {
    process.env.READ_SCOPE_FILE = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("read scope reads the editable file when present", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "readscope-test-"));
  const prev = process.env.READ_SCOPE_FILE;
  const file = path.join(tmp, "READ_SCOPE.md");
  process.env.READ_SCOPE_FILE = file;
  fs.writeFileSync(file, "禁止读取隐私与金额\n其余全部可读", "utf8");
  try {
    const scope = getReadScope();
    assert.equal(scope.exists, true);
    assert.equal(scope.fallback, false);
    assert.ok(scope.content.includes("禁止读取隐私与金额"));
  } finally {
    process.env.READ_SCOPE_FILE = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("buildPrompt always injects the read-scope boundary", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "readscope-test-"));
  const prev = process.env.READ_SCOPE_FILE;
  process.env.READ_SCOPE_FILE = path.join(tmp, "missing.md");
  try {
    const prompt = buildPrompt({ id: "t-1", title: "X", description: "Y" }, "C:/p");
    assert.match(prompt, /隐私/);
    assert.match(prompt, /金额/);
  } finally {
    process.env.READ_SCOPE_FILE = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
