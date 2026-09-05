import fs from "fs";
import path from "path";
import { runProcess } from "../src/adapters/processRunner.js";
import { getWorkerAccountPool } from "../src/workforce/accountPool.js";

async function testAccount(workerId, accountId, env = {}) {
  console.log(`\n----------------------------------------------------`);
  console.log(`正在探测 ${workerId} -> [${accountId}] ...`);
  if (Object.keys(env).length > 0) {
    console.log(`注入环境变量:`, JSON.stringify(env));
  } else {
    console.log(`使用系统默认环境 (主力账号 A)`);
  }

  const prompt = `Ping test from AI Founder OS. Reply exactly: "PONG: ${accountId} IS READY"`;
  const printArg = `--print=${prompt}`;
  const args = [
    "--output-format", "json",
    "--dangerously-skip-permissions",
    "--print-timeout", "30s",
    printArg
  ];

  const startTime = Date.now();
  const res = await runProcess({
    command: "agy",
    args,
    displayArgs: ["--output-format", "json", "--print=<ping>", "--dangerously-skip-permissions"],
    cwd: process.cwd(),
    dryRun: false,
    timeoutMs: 35000,
    env: { ...process.env, ...env }
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  if (res.exitCode === 0) {
    try {
      const parsed = JSON.parse(res.stdout.trim());
      if (parsed.status === "SUCCESS") {
        console.log(`✅ [${accountId}] 测试成功！耗时: ${duration}s`);
        console.log(`   模型回复: ${parsed.response?.trim()}`);
        console.log(`   Tokens: 输入 ${parsed.usage?.input_tokens}, 输出 ${parsed.usage?.output_tokens}`);
        return { ok: true, response: parsed.response?.trim() };
      } else {
        console.log(`❌ [${accountId}] 状态异常:`, parsed);
        return { ok: false, error: parsed.error || "Unknown error" };
      }
    } catch {
      console.log(`✅ [${accountId}] 运行成功！输出: ${res.stdout.trim()}`);
      return { ok: true, stdout: res.stdout.trim() };
    }
  } else {
    console.log(`❌ [${accountId}] 测试失败！退出码: ${res.exitCode}`);
    const errText = res.stderr || res.stdout;
    if (/not logged in|error getting token source|AUTH_REQUIRED/i.test(errText)) {
      console.log(`   提示: 该账号尚未完成登录认证。`);
      console.log(`   请运行: powershell -ExecutionPolicy Bypass -File scripts/login_antigravity_account_b.ps1 完成一次性网页授权。`);
    } else {
      console.log(`   错误信息: ${errText.slice(0, 300)}`);
    }
    return { ok: false, error: errText };
  }
}

async function main() {
  console.log("====================================================");
  console.log("      Antigravity 双账号就绪状态探测与测试");
  console.log("====================================================");

  const pool = getWorkerAccountPool("antigravity");
  const accA = pool.accounts.account_a;
  const accB = pool.accounts.account_b || {
    id: "account_b",
    env: {
      USERPROFILE: "C:\\Users\\22145\\.antigravity_account_b",
      HOME: "C:\\Users\\22145\\.antigravity_account_b"
    }
  };

  // 1. 测试账号 A
  await testAccount("antigravity", accA.id, accA.env || {});

  // 2. 测试账号 B
  const bEnv = accB.env || {
    USERPROFILE: "C:\\Users\\22145\\.antigravity_account_b",
    HOME: "C:\\Users\\22145\\.antigravity_account_b"
  };
  await testAccount("antigravity", accB.id, bEnv);

  console.log(`\n====================================================`);
  console.log("探测结束。");
  console.log("====================================================");
}

main().catch(console.error);
