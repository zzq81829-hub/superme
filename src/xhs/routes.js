import express from "express";
import { getXhsDashboard } from "./dashboard.js";
import { generateDailyPlan } from "./strategist.js";
import { generateContentPackage } from "./studio.js";
import { verifyContent } from "./qc.js";
import { dispatchPublish, getPublishStatus } from "./publisher/service.js";
import { syncMetrics } from "./analyst.js";
import { runXhsReflection } from "./reflection.js";
import { getXhsPolicy, patchXhsPolicy } from "./policy.js";
import { createExperiment, listExperiments } from "./experiments.js";
import { getContentObject, listContentObjects } from "./contentObject.js";

export const xhsOpsRouter = express.Router();

// 1. Dashboard
xhsOpsRouter.get("/dashboard", async (req, res) => {
  try {
    const data = await getXhsDashboard();
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 2. Planning
xhsOpsRouter.post("/plan", async (req, res) => {
  try {
    const plan = generateDailyPlan(req.body || {});
    res.status(201).json({ ok: true, plan });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// 3. Content Generation
xhsOpsRouter.post("/content/generate", async (req, res) => {
  try {
    const contentId = req.body?.content_id || req.body?.id;
    if (!contentId) return res.status(400).json({ ok: false, error: "content_id is required" });
    const content = generateContentPackage(contentId);
    res.status(201).json({ ok: true, content });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// 4. Content Verification / QC
xhsOpsRouter.post("/content/:id/verify", async (req, res) => {
  try {
    const result = verifyContent(req.params.id, req.body || {});
    res.json({ ok: true, content: result, qc: result.qc_details });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// 5. Publish Content
xhsOpsRouter.post("/publish", async (req, res) => {
  try {
    const result = await dispatchPublish(req.body || {});
    res.status(result.ok ? 200 : 422).json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// 6. Publish Status
xhsOpsRouter.get("/publish/:id/status", (req, res) => {
  try {
    const status = getPublishStatus(req.params.id);
    if (!status) return res.status(404).json({ ok: false, error: "Content not found" });
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 7. Metrics Sync
xhsOpsRouter.post("/metrics/sync", async (req, res) => {
  try {
    const result = await syncMetrics(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// 8. Autonomous Reflection & Policy Evolution
xhsOpsRouter.post("/reflection/run", async (req, res) => {
  try {
    const result = await runXhsReflection(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 9. Policies: Get & Patch
xhsOpsRouter.get("/policy", (req, res) => {
  try {
    const account = req.query?.account || null;
    const policies = getXhsPolicy(account);
    res.json({ ok: true, policies });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsOpsRouter.patch("/policy", (req, res) => {
  try {
    const updated = patchXhsPolicy(req.body || {});
    res.json({ ok: true, policies: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// 10. Experiments
xhsOpsRouter.post("/experiments", (req, res) => {
  try {
    const exp = createExperiment(req.body || {});
    res.status(201).json({ ok: true, experiment: exp });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

xhsOpsRouter.get("/experiments", (req, res) => {
  try {
    const exps = listExperiments(req.query || {});
    res.json({ ok: true, experiments: exps });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 11. Helper: Content list & get
xhsOpsRouter.get("/contents", (req, res) => {
  try {
    const list = listContentObjects(req.query || {});
    res.json({ ok: true, contents: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsOpsRouter.get("/contents/:id", (req, res) => {
  try {
    const item = getContentObject(req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: "Content not found" });
    res.json({ ok: true, content: item });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
