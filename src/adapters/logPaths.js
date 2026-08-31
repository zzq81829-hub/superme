import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..", "..");
const reportsDir = path.join(appRoot, "data", "reports");

function safeName(value) {
  return String(value || Date.now()).replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function executionLogPaths(taskId, agent) {
  fs.mkdirSync(reportsDir, { recursive: true });
  const stem = `${safeName(taskId)}-${safeName(agent)}`;
  const wrapperLogPath = path.join(reportsDir, `${stem}.json`);
  const cliLogPath = path.join(reportsDir, `${stem}-cli.log`);

  return {
    wrapperLogPath,
    cliLogPath,
    relative(filePath) {
      return path.relative(appRoot, filePath).split(path.sep).join("/");
    }
  };
}
