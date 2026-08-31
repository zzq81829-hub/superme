const SUPPORTED_TYPES = new Set(["file-exists", "file-equals", "file-contains", "command"]);
const ALLOWED_COMMANDS = new Set(["node", "npm", "npm.cmd", "pnpm", "pnpm.cmd", "python", "python.exe", "git", "git.exe"]);

function parseCommand(text) {
  const parts = String(text).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) throw new Error("command acceptance criterion is empty");
  return { type: "command", command: parts[0], args: parts.slice(1) };
}

function parseFileComparison(type, text, lineNumber) {
  const separator = text.indexOf("=>");
  if (separator < 0) {
    throw new Error(`acceptance criterion line ${lineNumber} must use => between path and expected text`);
  }
  const file = text.slice(0, separator).trim();
  const value = text.slice(separator + 2);
  if (!file) throw new Error(`acceptance criterion line ${lineNumber} has no file path`);
  return { type, path: file, value };
}

export function parseAcceptanceText(input = "") {
  const criteria = [];
  const lines = String(input).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    const match = line.match(/^(exists|存在|equals|内容|contains|包含|command|运行)\s*:\s*(.*)$/i);
    if (!match) {
      throw new Error(`unsupported acceptance criterion on line ${index + 1}`);
    }
    const [, rawType, body] = match;
    const type = rawType.toLowerCase();
    if (["exists", "存在"].includes(type)) {
      if (!body.trim()) throw new Error(`acceptance criterion line ${index + 1} has no file path`);
      criteria.push({ type: "file-exists", path: body.trim() });
    } else if (["equals", "内容"].includes(type)) {
      criteria.push(parseFileComparison("file-equals", body, index + 1));
    } else if (["contains", "包含"].includes(type)) {
      criteria.push(parseFileComparison("file-contains", body, index + 1));
    } else {
      criteria.push(parseCommand(body));
    }
  }
  return criteria;
}

export function normalizeAcceptanceCriteria(input) {
  if (input == null || input === "") return [];
  const criteria = typeof input === "string" ? parseAcceptanceText(input) : input;
  if (!Array.isArray(criteria)) throw new Error("acceptanceCriteria must be an array or supported text syntax");
  if (criteria.length > 20) throw new Error("acceptanceCriteria supports at most 20 checks");

  return criteria.map((criterion, index) => {
    if (!criterion || typeof criterion !== "object" || !SUPPORTED_TYPES.has(criterion.type)) {
      throw new Error(`unsupported acceptance criterion at index ${index}`);
    }
    if (criterion.type === "command") {
      const command = String(criterion.command || "").toLowerCase();
      if (!ALLOWED_COMMANDS.has(command)) {
        throw new Error(`acceptance command is not allowed: ${criterion.command || "(empty)"}`);
      }
      if (criterion.args != null && (!Array.isArray(criterion.args) || criterion.args.some((arg) => typeof arg !== "string"))) {
        throw new Error(`acceptance command args must be strings at index ${index}`);
      }
      if ((criterion.args || []).some((arg) => /[&|<>^%!"\r\n]/.test(arg))) {
        throw new Error(`acceptance command args contain shell metacharacters at index ${index}`);
      }
      return { type: "command", command, args: criterion.args || [] };
    }

    if (typeof criterion.path !== "string" || !criterion.path.trim()) {
      throw new Error(`acceptance file path is required at index ${index}`);
    }
    if (criterion.type !== "file-exists" && typeof criterion.value !== "string") {
      throw new Error(`acceptance expected text is required at index ${index}`);
    }
    return {
      type: criterion.type,
      path: criterion.path.trim(),
      ...(criterion.type === "file-exists" ? {} : { value: criterion.value, trim: !!criterion.trim })
    };
  });
}

export function describeAcceptanceCriteria(criteria = []) {
  return criteria.map((criterion) => {
    if (criterion.type === "command") return `command: ${criterion.command} ${(criterion.args || []).join(" ")}`.trim();
    if (criterion.type === "file-exists") return `file exists: ${criterion.path}`;
    return `${criterion.type === "file-equals" ? "file equals" : "file contains"}: ${criterion.path} => ${criterion.value}`;
  });
}
