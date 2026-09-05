import express from "express";
import { xhsIntelligenceService } from "../services/xhsService.js";

export const xhsRouter = express.Router();

// 1. System Status & Mode
xhsRouter.get("/status", (_req, res) => {
  try {
    res.json(xhsIntelligenceService.getStatus());
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsRouter.post("/mode", (req, res) => {
  try {
    const { mode } = req.body || {};
    xhsIntelligenceService.setMode(mode);
    res.json({ ok: true, mode: xhsIntelligenceService.activeMode });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// 2. My Accounts
xhsRouter.get("/accounts", (_req, res) => {
  try {
    res.json({ ok: true, accounts: xhsIntelligenceService.getAccounts() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsRouter.post("/accounts/:accountKey/login-window", (req, res) => {
  try {
    const { accountKey } = req.params;
    const result = xhsIntelligenceService.openAccountLoginWindow(accountKey);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsRouter.post("/accounts/:accountKey/reset", (req, res) => {
  try {
    const { accountKey } = req.params;
    const result = xhsIntelligenceService.resetAccount(accountKey);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsRouter.post("/accounts/:accountKey/collect", async (req, res) => {
  try {
    const { accountKey } = req.params;
    const { mock } = req.body || {};
    const result = await xhsIntelligenceService.collectAccount(accountKey, !!mock, true);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsRouter.post("/collect-all", async (req, res) => {
  try {
    const { mock } = req.body || {};
    const result = await xhsIntelligenceService.collectAllAccounts(!!mock, true);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 3. Notes & History
xhsRouter.get("/notes", (req, res) => {
  try {
    const { accountKey } = req.query;
    res.json({ ok: true, notes: xhsIntelligenceService.getNotes(accountKey) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsRouter.get("/notes/:noteId/history", (req, res) => {
  try {
    const { noteId } = req.params;
    res.json({ ok: true, history: xhsIntelligenceService.getNoteHistory(noteId) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4. Competitors / Public Research
xhsRouter.get("/competitors", (_req, res) => {
  try {
    res.json({ ok: true, competitors: xhsIntelligenceService.getCompetitors() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsRouter.post("/competitors", (req, res) => {
  try {
    const { creatorId, nickname, profileUrl } = req.body || {};
    if (!creatorId) return res.status(400).json({ ok: false, error: "creatorId is required" });
    const result = xhsIntelligenceService.addCompetitor({ creatorId, nickname, profileUrl });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsRouter.post("/research/login-window", (_req, res) => {
  try {
    const result = xhsIntelligenceService.openResearchLoginWindow();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsRouter.post("/search", async (req, res) => {
  try {
    const { keywords, mock } = req.body || {};
    const result = await xhsIntelligenceService.collectPublic(keywords || [], !!mock, true);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsRouter.get("/trending", (_req, res) => {
  try {
    res.json({ ok: true, trending: xhsIntelligenceService.getTrending() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5. Daily Brief
xhsRouter.get("/brief", (_req, res) => {
  try {
    res.json({ ok: true, brief: xhsIntelligenceService.getDailyBrief() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 6. Keywords Management
xhsRouter.get("/keywords", (_req, res) => {
  try {
    res.json({ ok: true, keywords: xhsIntelligenceService.getKeywords() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

xhsRouter.post("/keywords", (req, res) => {
  try {
    const { keyword } = req.body || {};
    const created = xhsIntelligenceService.addKeyword(keyword);
    res.json({ ok: true, keyword: created });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

xhsRouter.delete("/keywords/:id", (req, res) => {
  try {
    const { id } = req.params;
    xhsIntelligenceService.removeKeyword(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
