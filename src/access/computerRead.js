import fs from "fs";
import path from "path";

const PRIVATE_PATH = /(?:^|[\\/._ -])(appdata|passwords?|secrets?|tokens?|keys?|credentials?|wallet|bank|billing|invoice|tax|身份证|银行卡|账单|金额)(?:$|[\\/._ -])/i;
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json", ".csv", ".tsv", ".html", ".css", ".js", ".mjs", ".ts", ".tsx", ".jsx", ".py", ".yaml", ".yml", ".xml"]);

export function defaultComputerRoots(profile = process.env.USERPROFILE || "") {
  return Object.fromEntries(["Desktop", "Documents", "Downloads", "Pictures", "Videos", "Music"].map((name) => [name.toLowerCase(), path.join(profile, name)]));
}

function resolveSafePath(rootName, relativePath, roots) {
  const root = path.resolve(roots[String(rootName || "").toLowerCase()] || "");
  if (!root || !fs.existsSync(root)) throw new Error("Unknown or unavailable computer folder");
  const target = path.resolve(root, String(relativePath || "."));
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative) || PRIVATE_PATH.test(relative)) throw new Error("Privacy policy blocks this path");
  return { root, target };
}

export function listSafeComputerFiles({ rootName, query = "", roots = defaultComputerRoots(), limit = 100 }) {
  const { root } = resolveSafePath(rootName, ".", roots);
  const needle = String(query).trim().toLowerCase();
  const found = [];
  const pending = [root];
  while (pending.length && found.length < Math.min(limit, 200)) {
    const current = pending.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute);
      if (PRIVATE_PATH.test(relative)) continue;
      if (entry.isDirectory()) pending.push(absolute);
      else if (!needle || entry.name.toLowerCase().includes(needle)) found.push({ name: entry.name, path: relative });
      if (found.length >= limit) break;
    }
  }
  return found;
}

export function readSafeComputerText({ rootName, relativePath, roots = defaultComputerRoots() }) {
  const { target } = resolveSafePath(rootName, relativePath, roots);
  if (!fs.statSync(target).isFile() || !TEXT_EXTENSIONS.has(path.extname(target).toLowerCase())) throw new Error("Only supported text files can be read");
  if (fs.statSync(target).size > 262144) throw new Error("File is larger than the 256 KB safe-reading limit");
  return fs.readFileSync(target, "utf8")
    .replace(/(?:¥|￥|\$|USD|CNY|RMB)\s*\d[\d,.]*/gi, "[金额已隐藏]")
    .replace(/\b1\d{10}\b/g, "[手机号已隐藏]")
    .replace(/\b\d{17}[\dXx]\b/g, "[身份证号已隐藏]");
}

