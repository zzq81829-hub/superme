import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getWorkerAccountPool, configureWorkerAccounts } from './accountPool.js';
import { resolveAgentCommand } from '../adapters/resolveCommand.js';
import { classifyCodexProbe } from '../workers/health.js';

export const ACCOUNT_WORKERS = ['antigravity', 'codex'];
function validate(workerId, accountId) {
  if (!ACCOUNT_WORKERS.includes(workerId)) throw new Error('账号管理仅支持 Antigravity 和 Codex');
  if (accountId && !['account_a', 'account_b'].includes(accountId)) throw new Error('只支持主力 A 和备用 B 两个账号');
}

export function publicAccountPool(pool) {
  return {
    workerId: pool.workerId,
    primaryAccountId: pool.primaryAccountId,
    activeAccountId: pool.activeAccountId,
    maxAccounts: 2,
    accounts: Object.values(pool.accounts || {}).map(account => ({
      id: account.id,
      name: account.name || account.id,
      status: account.status || 'AUTH_REQUIRED',
      binding: account.binding || (account.id === 'account_a' ? 'current' : 'unverified'),
      profileConfigured: !!account.env?.CODEX_HOME,
      verifiedAt: account.verifiedAt || null,
      cooldownUntil: account.cooldownUntil || null,
      successes: account.stats?.successCount || 0,
      quotaHits: account.stats?.quotaHits || 0
    }))
  };
}

export function listAccountConsole(options = {}) {
  return ACCOUNT_WORKERS.map(id => publicAccountPool(getWorkerAccountPool(id, options)));
}

export function saveAccountSlot(workerId, input = {}, options = {}) {
  const accountId = input.accountId || 'account_b';
  validate(workerId, accountId);
  if (input.env || input.status || input.accounts) throw new Error('此入口不接收密码、环境变量或手工可用状态');
  const pool = getWorkerAccountPool(workerId, options);
  const existing = pool.accounts[accountId];
  const name = String(input.name || existing?.name || `${workerId} ${accountId === 'account_a' ? '主力 A' : '备用 B'}`).trim().slice(0, 60);
  const profilePath = String(input.profilePath || '').trim();
  if (profilePath && (workerId !== 'codex' || !path.isAbsolute(profilePath))) throw new Error('Codex 独立配置目录须为绝对路径');
  if (profilePath) {
    const otherId = accountId === 'account_a' ? 'account_b' : 'account_a';
    const other = pool.accounts[otherId];
    const otherPath = other?.env?.CODEX_HOME || (otherId === 'account_a' ? process.env.CODEX_HOME || path.join(process.env.USERPROFILE || '', '.codex') : '');
    if (otherPath && path.resolve(otherPath).toLowerCase() === path.resolve(profilePath).toLowerCase()) throw new Error('两个账号不能共用同一配置目录');
  }
  const changedBinding = profilePath && profilePath !== existing?.env?.CODEX_HOME;
  const account = {
    ...existing,
    id: accountId,
    name,
    managed: true,
    status: !existing || changedBinding || input.requireLogin === true ? 'AUTH_REQUIRED' : existing.status,
    binding: workerId === 'antigravity' ? 'current' : profilePath ? 'isolated' : existing?.binding || (accountId === 'account_a' ? 'current' : 'unconfigured'),
    env: profilePath ? { CODEX_HOME: path.resolve(profilePath) } : existing?.env || {},
    ...(changedBinding ? { verifiedAt: null } : {})
  };
  // A newly registered slot never inherits the current account's login.
  if (!existing) account.verifiedAt = null;
  const managedAccounts = Object.fromEntries(Object.entries(pool.accounts).map(([id, value]) => [id, { ...value, managed: true }]));
  return publicAccountPool(configureWorkerAccounts(workerId, { accounts: { ...managedAccounts, [accountId]: account } }, options));
}

export function checkAccountSlot(workerId, accountId, input = {}, options = {}) {
  validate(workerId, accountId);
  const pool = getWorkerAccountPool(workerId, options);
  const account = pool.accounts[accountId];
  if (!account) throw new Error('请先添加这个账号');
  if (workerId === 'codex' && accountId === 'account_b' && !account.env?.CODEX_HOME) {
    throw new Error('备用 Codex 尚未绑定独立配置目录；不能把当前登录当作第二个账号');
  }
  if (workerId === 'antigravity' && input.confirmCurrentLogin !== true) {
    throw new Error('请先在 Antigravity 中切换到对应账号，再确认检查当前登录');
  }
  const probe = options.probe || ((id, target) => {
    const command = resolveAgentCommand(id, id === 'codex' ? 'codex' : 'agy');
    const result = spawnSync(command, id === 'codex' ? ['login', 'status'] : ['models'], {
      encoding: 'utf8', windowsHide: true, timeout: 15000,
      env: { ...process.env, ...(id === 'codex' && target.env?.CODEX_HOME ? { CODEX_HOME: target.env.CODEX_HOME } : {}) }
    });
    if (id === 'codex') return classifyCodexProbe(`${result.stdout || ''}\n${result.stderr || ''}`, result.status, result.error).available === true;
    const text = `${result.stdout || ''}\n${result.stderr || ''}`;
    return result.status === 0 && /gemini/i.test(text) && !/authentication failed|not logged|login required|timed out/i.test(text);
  });
  const loggedIn = probe(workerId, account);
  const stillCooling = account.cooldownUntil && new Date(account.cooldownUntil).getTime() > Date.now();
  const updatedAccounts = { [accountId]: {
    ...account, managed: true, verifiedAt: new Date().toISOString(),
    status: loggedIn ? stillCooling ? 'COOLDOWN' : 'AVAILABLE' : 'AUTH_REQUIRED',
    binding: workerId === 'codex' && account.env?.CODEX_HOME ? 'isolated' : 'current'
  } };
  if (workerId === 'antigravity' && loggedIn) {
    // The installed CLI exposes one current login, not a verified account selector.
    for (const other of Object.values(pool.accounts)) {
      if (other.id !== accountId) updatedAccounts[other.id] = { ...other, status: 'INACTIVE', managed: true };
    }
  }
  const updated = configureWorkerAccounts(workerId, {
    accounts: updatedAccounts,
    ...(loggedIn && !stillCooling ? { activeAccountId: accountId } : {})
  }, options);
  return { pool: publicAccountPool(updated), loggedIn, note: loggedIn ? '登录检查通过；剩余额度仍以实际执行结果为准' : '登录检查未通过，请完成对应账号登录后重试' };
}
