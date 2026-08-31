import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { loadConfig } from "./src/config.js";
import { createTask, listTasks, getTask, updateTask } from "./src/store.js";
import { dispatchTask } from "./src/router.js";
import { resolveAgentCommand } from "./src/adapters/resolveCommand.js";
import { listWorkerHealth } from "./src/workers/health.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadConfig();
const app = express();
const version = "1.0.0";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", async (_req, res) => {
  const workers = listWorkerHealth();
  res.json({
    ok: true,
    version,
    dryRun: config.dryRun,
    ceo: { name: "Hermes", ...(workers.find((w) => w.id === "hermes") || {}) },
    workers,
    agents: Object.fromEntries(
      Object.entries(config.agents).map(([k, v]) => [k, {
        enabled: !!v.enabled,
        command: v.command,
        resolvedCommand: resolveAgentCommand(k === "grokBuild" ? "grok-build" : k, v.command),
        model: v.model || null
      }])
    )
  });
});

app.get("/api/workers", (_req, res) => res.json(listWorkerHealth()));

app.get("/api/hermes/status", (_req, res) => {
  res.json(listWorkerHealth().find((w) => w.id === "hermes") || { status: "OFFLINE" });
});

app.get("/api/tasks", (_req, res) => res.json(listTasks()));

app.get("/api/tasks/:id", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});

app.post("/api/tasks", async (req, res) => {
  try {
    const { title, description, agent = "auto", projectPath = "", execute = true } = req.body ?? {};
    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ error: "title and description are required" });
    }
    if (!["auto", "hermes", "codex", "claude", "antigravity", "grok-build", "grok", "grok-bot", "deepseek"].includes(agent)) {
      return res.status(400).json({ error: "unsupported agent" });
    }
    if (typeof projectPath !== "string") {
      return res.status(400).json({ error: "projectPath must be a string" });
    }

    const task = createTask({
      title: title.trim(),
      description: description.trim(),
      agent,
      projectPath
    });

    if (execute !== false) {
      updateTask(task.id, { status: "queued" });
      dispatchTask(task.id, config).catch((error) => {
        updateTask(task.id, {
          status: "failed",
          error: error?.stack || String(error),
          finishedAt: new Date().toISOString()
        });
      });
      return res.status(201).json(getTask(task.id));
    }

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tasks/:id/run", async (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (["queued", "running"].includes(task.status)) {
    return res.status(409).json({ error: `Task is already ${task.status}` });
  }

  updateTask(task.id, { status: "queued" });

  // Return immediately. The task keeps running in this process.
  dispatchTask(task.id, config).catch((error) => {
    updateTask(task.id, {
      status: "failed",
      error: error?.stack || String(error),
      finishedAt: new Date().toISOString()
    });
  });

  res.json({ ok: true, taskId: task.id, status: "queued" });
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(config.port, config.host, () => {
  console.log(`AI Founder OS ${version} running at http://${config.host}:${config.port}`);
  console.log(`dryRun=${config.dryRun}`);
});
