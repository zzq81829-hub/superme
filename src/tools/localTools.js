import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const catalogPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../config/local-tools.json");

export function listLocalTools() {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  return Object.entries(catalog).map(([id, spec]) => ({
    id,
    path: spec.path,
    exists: fs.existsSync(spec.path),
    cli: spec.cli,
    keep: spec.keep !== false
  }));
}

export function getLocalTool(id) {
  return listLocalTools().find((t) => t.id === id) || null;
}
