import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import express from "express";
import http from "http";
import { xhsOpsRouter } from "../src/xhs/routes.js";
import { createContentObject, CONTENT_STATES } from "../src/xhs/contentObject.js";

function setupEphemeralServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "xhs-api-test-"));
  const baseDir = path.join(tmpDir, "contents");
  const policyFile = path.join(tmpDir, "policies.json");
  const experimentsFile = path.join(tmpDir, "experiments.json");

  process.env.XHS_CONTENT_BASE_DIR = baseDir;
  process.env.XHS_POLICY_FILE = policyFile;
  process.env.XHS_EXPERIMENTS_FILE = experimentsFile;

  const app = express();
  app.use(express.json());
  app.use("/api/xhs", xhsOpsRouter);

  const server = http.createServer(app);

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}/api/xhs`;

      const cleanup = () => {
        return new Promise((res) => {
          server.close(() => {
            delete process.env.XHS_CONTENT_BASE_DIR;
            delete process.env.XHS_POLICY_FILE;
            delete process.env.XHS_EXPERIMENTS_FILE;
            fs.rmSync(tmpDir, { recursive: true, force: true });
            res();
          });
        });
      };

      resolve({ baseUrl, cleanup });
    });
  });
}

test("XHS Autonomous Operations HTTP REST API Endpoints (All 11 Endpoints)", async () => {
  const { baseUrl, cleanup } = await setupEphemeralServer();

  // 1. GET /api/xhs/dashboard
  const dashRes = await fetch(`${baseUrl}/dashboard`);
  assert.equal(dashRes.status, 200);
  const dashJson = await dashRes.json();
  assert.equal(dashJson.ok, true);
  assert.equal(dashJson.operational_status, "RUNNING");
  assert.ok(dashJson.summary);

  // 2. POST /api/xhs/plan
  const planRes = await fetch(`${baseUrl}/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accounts: ["x_curation", "shuzhai"] })
  });
  assert.equal(planRes.status, 201);
  const planJson = await planRes.json();
  assert.equal(planJson.ok, true);
  assert.ok(planJson.plan.total_planned >= 2);
  const targetId = planJson.plan.items[0].id;

  // 3. POST /api/xhs/content/generate
  const genRes = await fetch(`${baseUrl}/content/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content_id: targetId })
  });
  assert.equal(genRes.status, 201);
  const genJson = await genRes.json();
  assert.equal(genJson.ok, true);
  assert.equal(genJson.content.status, "QC");
  assert.ok(genJson.content.package.title);

  // 4. POST /api/xhs/content/:id/verify
  const qcRes = await fetch(`${baseUrl}/content/${targetId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  assert.equal(qcRes.status, 200);
  const qcJson = await qcRes.json();
  assert.equal(qcJson.ok, true);
  assert.ok(qcJson.qc.quality_score > 0);
  assert.ok(["APPROVED", "SCHEDULED"].includes(qcJson.content.status));

  // 5. POST /api/xhs/publish
  const pubRes = await fetch(`${baseUrl}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content_id: targetId, driver: "mock" })
  });
  assert.equal(pubRes.status, 200);
  const pubJson = await pubRes.json();
  assert.equal(pubJson.ok, true);
  assert.equal(pubJson.result.status, "published");

  // 6. GET /api/xhs/publish/:id/status
  const statusRes = await fetch(`${baseUrl}/publish/${targetId}/status`);
  assert.equal(statusRes.status, 200);
  const statusJson = await statusRes.json();
  assert.equal(statusJson.ok, true);
  assert.equal(statusJson.lifecycle_status, "PUBLISHED");
  assert.ok(statusJson.publish_result.url);

  // 7. POST /api/xhs/metrics/sync
  const syncRes = await fetch(`${baseUrl}/metrics/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content_id: targetId,
      stage: "24h",
      metrics: {
        impressions: 8000,
        views: 2100,
        likes: 180,
        favorites: 420,
        gmv: 400
      }
    })
  });
  assert.equal(syncRes.status, 200);
  const syncJson = await syncRes.json();
  assert.equal(syncJson.ok, true);
  assert.equal(syncJson.status, "24H_METRICS");
  assert.equal(syncJson.metrics.impressions, 8000);

  // 8. POST /api/xhs/reflection/run
  const refRes = await fetch(`${baseUrl}/reflection/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(refRes.status, 200);
  const refJson = await refRes.json();
  assert.equal(refJson.ok, true);
  assert.ok(refJson.findings.length > 0);
  assert.ok(refJson.hypotheses.length > 0);
  assert.ok(refJson.policy_changes.length > 0);

  // 9. GET /api/xhs/policy
  const polRes = await fetch(`${baseUrl}/policy`);
  assert.equal(polRes.status, 200);
  const polJson = await polRes.json();
  assert.equal(polJson.ok, true);
  assert.ok(polJson.policies.shuzhai);

  // 10. PATCH /api/xhs/policy
  const patchRes = await fetch(`${baseUrl}/policy`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shuzhai: { daily_quota: 4 }
    })
  });
  assert.equal(patchRes.status, 200);
  const patchJson = await patchRes.json();
  assert.equal(patchJson.ok, true);
  assert.equal(patchJson.policies.shuzhai.daily_quota, 4);

  // 11. POST /api/xhs/experiments
  const expRes = await fetch(`${baseUrl}/experiments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account: "x_curation",
      hypothesis: "短标题比长标题点击率更高",
      variable: "title_length",
      variant_a: { name: "短", value: "变富的底层逻辑" },
      variant_b: { name: "长", value: "为什么你看了那么多书依然没能变富的底层逻辑" }
    })
  });
  assert.equal(expRes.status, 201);
  const expJson = await expRes.json();
  assert.equal(expJson.ok, true);
  assert.equal(expJson.experiment.account, "x_curation");

  await cleanup();
});
