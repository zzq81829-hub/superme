import crypto from "crypto";
import fs from "fs";
import path from "path";

const DEFAULT_TOKEN_PATH = path.resolve(process.cwd(), "data", "phone-access-token");

export function peekPhoneAccessToken(options = {}) {
  const tokenPath = options.tokenPath || process.env.FOUNDER_OS_PHONE_TOKEN_FILE || DEFAULT_TOKEN_PATH;
  if (!fs.existsSync(tokenPath)) return null;
  try {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    return existing || null;
  } catch {
    return null;
  }
}

export function getPhoneAccessToken(options = {}) {
  const tokenPath = options.tokenPath || process.env.FOUNDER_OS_PHONE_TOKEN_FILE || DEFAULT_TOKEN_PATH;
  if (options.reset && fs.existsSync(tokenPath)) fs.rmSync(tokenPath, { force: true });
  const existing = peekPhoneAccessToken({ tokenPath });
  if (existing && !options.reset) return existing;
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  const token = crypto.randomBytes(18).toString("base64url");
  fs.writeFileSync(tokenPath, `${token}\n`, { encoding: "utf8", flag: "w" });
  return token;
}
