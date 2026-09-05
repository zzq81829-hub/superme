import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { getPhoneAccessToken, peekPhoneAccessToken } from "../src/phoneAccess.js";

test("peekPhoneAccessToken never creates a token file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "founder-os-phone-peek-"));
  const tokenPath = path.join(dir, "token");
  try {
    assert.equal(peekPhoneAccessToken({ tokenPath }), null);
    assert.equal(fs.existsSync(tokenPath), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("phone access launcher keeps a stable token and supports rotation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "founder-os-phone-"));
  const tokenPath = path.join(dir, "token");
  try {
    const first = getPhoneAccessToken({ tokenPath });
    assert.equal(getPhoneAccessToken({ tokenPath }), first);
    assert.notEqual(getPhoneAccessToken({ tokenPath, reset: true }), first);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("phone access launcher binds explicitly and does not default to LAN", () => {
  const source = fs.readFileSync(new URL("../scripts/start-phone.js", import.meta.url), "utf8");
  assert.match(source, /AI_FOUNDER_OS_PHONE_TOKEN/);
  assert.match(source, /AI_FOUNDER_OS_HOST: \"0\.0\.0\.0\"/);
  assert.match(source, /首次配对/);
});

test("phone token protects LAN APIs without locking out the local desktop", () => {
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(source, /req\.socket\.remoteAddress/);
  assert.match(source, /::ffff:127\.0\.0\.1/);
  assert.match(source, /X-OS-Phone-Token/);
});
