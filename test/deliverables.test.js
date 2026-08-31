import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { buildDeliverables } from "../src/tasks/deliverables.js";

test("founder deliverables expose capabilities and existing project files", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "founder-deliverables-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "ready.png"), "image");

  const deliverables = buildDeliverables(
    { title: "完成图文", acceptanceCriteria: [{ type: "file-exists", path: "ready.png" }] },
    dir,
    { message: "CAN_USE: 可以直接审阅小红书封面\nARTIFACT: ready.png\nARTIFACT: ../secret.txt" }
  );

  assert.deepEqual(deliverables.capabilities, ["可以直接审阅小红书封面"]);
  assert.equal(deliverables.artifacts.length, 1);
  assert.equal(deliverables.artifacts[0].path, path.join(dir, "ready.png"));
});
