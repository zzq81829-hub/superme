import fs from "fs";
import path from "path";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function markerValues(message, marker) {
  const pattern = new RegExp(`^\\s*(?:[-*]\\s*)?${marker}\\s*:\\s*(.+)$`, "gim");
  return [...String(message || "").matchAll(pattern)].map((match) => match[1].trim());
}

function safeArtifact(projectPath, candidate) {
  const root = path.resolve(projectPath);
  const absolutePath = path.resolve(root, candidate);
  const relativePath = path.relative(root, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || !fs.existsSync(absolutePath)) return null;
  return { label: path.basename(absolutePath), path: absolutePath };
}

export function buildDeliverables(task, projectPath, result = {}) {
  const capabilities = unique(markerValues(result.message, "CAN_USE"));
  const declaredArtifacts = markerValues(result.message, "ARTIFACT");
  const verifiedArtifacts = (task.acceptanceCriteria || [])
    .filter((criterion) => criterion.type?.startsWith("file-"))
    .map((criterion) => criterion.path);
  const artifacts = unique([...declaredArtifacts, ...verifiedArtifacts])
    .map((candidate) => safeArtifact(projectPath, candidate))
    .filter(Boolean);

  return {
    capabilities: capabilities.length ? capabilities : [String(task.title || "已完成该任务")],
    artifacts
  };
}

