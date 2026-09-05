import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { listContentObjects } from "./contentObject.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

export function getXhsExperimentsFile(options = {}) {
  if (options.experimentsFile) return options.experimentsFile;
  if (process.env.XHS_EXPERIMENTS_FILE) return process.env.XHS_EXPERIMENTS_FILE;
  return path.join(root, "data", "xhs", "experiments.json");
}

export function listExperiments(filter = {}, options = {}) {
  const file = getXhsExperimentsFile(options);
  if (!fs.existsSync(file)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    return list.filter((exp) => {
      if (filter.account && exp.account !== filter.account) return false;
      if (filter.status && exp.status !== filter.status) return false;
      return true;
    });
  } catch {
    return [];
  }
}

export function createExperiment(input, options = {}) {
  const file = getXhsExperimentsFile(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const list = listExperiments({}, options);
  const now = new Date().toISOString();
  const id = input.id || `exp_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`;

  const experiment = {
    id,
    hypothesis: input.hypothesis || "Single variable variation test",
    account: input.account || "shuzhai",
    variable: input.variable || "title_style",
    fixed_factors: input.fixed_factors || ["cover", "body_structure", "publish_time", "account"],
    variant_a: input.variant_a || { name: "Control", value: "" },
    variant_b: input.variant_b || { name: "Test", value: "" },
    status: input.status || "active",
    createdAt: now,
    evaluatedAt: null,
    winner: null,
    metrics_delta: null
  };

  list.push(experiment);
  fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf8");
  return experiment;
}

export function evaluateExperiment(experimentId, options = {}) {
  const file = getXhsExperimentsFile(options);
  const list = listExperiments({}, options);
  const expIndex = list.findIndex((e) => e.id === experimentId);
  if (expIndex === -1) return null;

  const exp = list[expIndex];
  const notes = listContentObjects({ account: exp.account }, options).filter(
    (n) => n.experiment_id === experimentId && n.status !== "IDEA" && n.status !== "PLANNED"
  );

  if (notes.length < 2) {
    return {
      status: "insufficient_data",
      notes_count: notes.length,
      message: "At least 2 notes with metrics required to evaluate experiment"
    };
  }

  // Calculate average engagement rate per variant
  const aNotes = notes.filter((n) => n.package?.experiment_variant === "A" || n.package?.title === exp.variant_a?.value);
  const bNotes = notes.filter((n) => n.package?.experiment_variant === "B" || n.package?.title === exp.variant_b?.value);

  const calcRate = (items) => {
    if (!items.length) return 0;
    const totalViews = items.reduce((sum, i) => sum + (i.metrics?.views || 0), 0);
    const totalEngage = items.reduce((sum, i) => sum + (i.metrics?.favorites || 0) + (i.metrics?.likes || 0), 0);
    return totalViews > 0 ? (totalEngage / totalViews) * 100 : 0;
  };

  const aRate = calcRate(aNotes);
  const bRate = calcRate(bNotes);

  const winner = bRate >= aRate ? "variant_b" : "variant_a";
  const delta = Math.round(Math.abs(bRate - aRate) * 100) / 100;

  exp.evaluatedAt = new Date().toISOString();
  exp.status = "completed";
  exp.winner = winner;
  exp.metrics_delta = { a_rate: aRate, b_rate: bRate, delta_percent: delta };

  list[expIndex] = exp;
  fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf8");

  return exp;
}
