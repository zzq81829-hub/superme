import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");

test("founder UI keeps the one-intent entry and two primary navigation paths", () => {
  assert.match(html, /class="intentTitle"/);
  assert.match(html, /href="#commandSection"[^>]*>.*发起/s);
  assert.match(html, /href="#taskSection"[^>]*>.*进度/s);
  assert.match(html, /id="mobileMoreToggle"/);
  assert.match(html, /id="connectionNotice"/);
  assert.match(app, /taskTitleFromIntent/);
  assert.match(app, /showPhonePairingHelp/);
  assert.match(app, /showSecondaryPanel/);
});
