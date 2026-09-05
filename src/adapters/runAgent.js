import { runCodex } from "./codex.js";
import { runAntigravity } from "./antigravity.js";
import { runClaude } from "./claude.js";
import { runGrokBuild } from "./grokBuild.js";
import { sendTask as runHermes } from "../integrations/hermes/bridge.js";

function projectPathOf(task, project, config) {
  return project || task?.projectPath || config?.workspaceRoot || process.cwd();
}

export async function runAgent(agent, task, project, config) {
  const projectPath = projectPathOf(task, project, config);
  const { buildPrompt } = await import("../router.js");
  const prompt = buildPrompt(task, projectPath);

  const { getEffectiveWorkerAccount, recordAccountQuotaHit } = await import("../workforce/accountPool.js");
  const { classifyWorkerError } = await import("../workforce/errorClassifier.js");

  const effective = getEffectiveWorkerAccount(agent);
  const activeAccount = effective?.account || { id: "default", env: {} };

  const invokeWorker = async (targetAccount) => {
    if (effective.pool && targetAccount.status !== "AVAILABLE") {
      return { ok: false, agent, accountUsed: targetAccount.id, error: "ACCOUNT_NOT_READY: 账号尚未登录、待检查或容量不可用" };
    }
    if (["codex", "antigravity"].includes(agent) && targetAccount.id === "account_b" &&
        (!targetAccount.managed || !targetAccount.verifiedAt || (agent === "codex" && (targetAccount.binding !== "isolated" || !targetAccount.env?.CODEX_HOME)))) {
      return { ok: false, agent, accountUsed: targetAccount.id, error: "ACCOUNT_NOT_READY: 备用账号尚未完成独立登录核验" };
    }
    const accountConfig = {
      ...(config || {}),
      env: {
        ...(config?.env || {}),
        ...(targetAccount?.managed
          ? agent === "codex" && targetAccount.binding === "isolated" && targetAccount.env?.CODEX_HOME ? { CODEX_HOME: targetAccount.env.CODEX_HOME } : {}
          : targetAccount?.env || {})
      }
    };

    let res;
    if (agent === "codex") res = await runCodex({ task, prompt, projectPath, config: accountConfig });
    else if (agent === "antigravity") res = await runAntigravity({ task, prompt, projectPath, config: accountConfig });
    else if (agent === "claude") res = await runClaude({ task, prompt, projectPath, config: accountConfig });
    else if (agent === "grok-build") res = await runGrokBuild({ task, prompt, projectPath, config: accountConfig, researchOnly: false });
    else if (agent === "grok") res = await runGrokBuild({ task, prompt, projectPath, config: accountConfig, researchOnly: true });
    else if (agent === "hermes" || agent === "deepseek") {
      res = await runHermes({ instruction: prompt, projectPath, config: accountConfig, taskId: task?.id || "hermes", agent });
    } else if (agent === "grok-bot") {
      return {
        ok: false,
        agent: "grok-bot",
        error: "grok-bot is the secretary persona (chat only), not a task worker — dispatch refused"
      };
    } else {
      return {
        ok: false,
        agent,
        error: `Unknown agent: ${agent}`
      };
    }

    return {
      ...res,
      accountUsed: targetAccount?.id || "default",
      isStandby: !!effective.pool && targetAccount?.id !== effective.pool.primaryAccountId
    };
  };

  let result = await invokeWorker(activeAccount);

  // Check if result hit quota exhaustion / rate limit
  if (!result.ok && !result.dryRun) {
    const errorCat = classifyWorkerError(result);
    if (errorCat === "QUOTA_EXHAUSTED" || errorCat === "RATE_LIMITED") {
      const hitRes = recordAccountQuotaHit(agent, activeAccount.id, result.error);
      if (hitRes.rotated && hitRes.currentAccountId !== activeAccount.id) {
        // Automatic failover rotation to Standby Account (e.g. Account B)
        const standbyEffective = getEffectiveWorkerAccount(agent);
        if (standbyEffective.account?.status === "AVAILABLE" && standbyEffective.account.id !== activeAccount.id) {
          const failoverResult = await invokeWorker(standbyEffective.account);
          if (!failoverResult.ok && ["QUOTA_EXHAUSTED", "RATE_LIMITED"].includes(classifyWorkerError(failoverResult))) {
            recordAccountQuotaHit(agent, standbyEffective.account.id, failoverResult.error);
          }
          return {
            ...failoverResult,
            failover: {
              fromAccount: activeAccount.id,
              toAccount: standbyEffective.account.id,
              reason: result.error || "Quota exhausted / Rate limited"
            }
          };
        }
      }
    }
  }

  return result;
}
