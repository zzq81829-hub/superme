import crypto from "crypto";
import fs from "fs";
import path from "path";

const DEFAULT_TOKEN_PATH = path.resolve(process.cwd(), "data", "phone-access-token");

export function getPhoneAccessToken(options = {}) {
  const tokenPath = options.tokenPath || process.env.FOUNDER_OS_PHONE_TOKEN_FILE || DEFAULT_TOKEN_PATH;
  if (options.reset && fs.existsSync(tokenPath)) fs.rmSync(tokenPath, { force: true });
  if (fs.existsSync(tokenPath)) {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing) return existing;
  }
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  const token = crypto.randomBytes(18).toString("base64url");
  fs.writeFileSync(tokenPath, `${token}\n`, { encoding: "utf8", flag: "w" });
  return token;
}
