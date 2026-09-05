import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveAccountSlot, listAccountConsole, checkAccountSlot, publicAccountPool } from '../src/workforce/accountConsole.js';
import { configureWorkerAccounts, getEffectiveWorkerAccount, manualResetAccount } from '../src/workforce/accountPool.js';
import { runAgent } from '../src/adapters/runAgent.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'os-account-console-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { poolFile: path.join(dir, 'pool.json') };
}

test('Two managed account slots, new standby is never implicitly logged in', t => {
  const options = fixture(t);
  const pool = saveAccountSlot('antigravity', { accountId: 'account_b' }, options);
  assert.equal(pool.accounts.length, 2);
  assert.equal(pool.accounts.find(a => a.id === 'account_b').status, 'AUTH_REQUIRED');
  assert.equal(getEffectiveWorkerAccount('antigravity', options).account.id, 'account_a');
  assert.throws(() => saveAccountSlot('antigravity', { accountId: 'account_c' }, options));
  assert.throws(() => configureWorkerAccounts('antigravity', { accounts: { account_c: { id: 'account_c' } } }, options), /最多/);
  assert.throws(() => saveAccountSlot('codex', { env: { TOKEN: 'test-only' } }, options));
});

test('Public account responses never expose environment values, profile paths or errors', t => {
  const options = fixture(t);
  const privateValue = 'test-secret-never-return';
  configureWorkerAccounts('codex', { accounts: { account_a: { id: 'account_a', env: { TOKEN: privateValue, CODEX_HOME: '/private/profile' }, lastError: privateValue } } }, options);
  const response = JSON.stringify(listAccountConsole(options));
  assert.ok(!response.includes(privateValue));
  assert.ok(!response.includes('/private/profile'));
  assert.ok(!response.includes('TOKEN'));
});

test('Antigravity check requires explicit current-login confirmation and activates only one slot', t => {
  const options = { ...fixture(t), probe: () => true };
  saveAccountSlot('antigravity', { accountId: 'account_b' }, options);
  assert.throws(() => checkAccountSlot('antigravity', 'account_b', {}, options));
  const result = checkAccountSlot('antigravity', 'account_b', { confirmCurrentLogin: true }, options);
  assert.equal(result.loggedIn, true);
  assert.equal(result.pool.accounts.find(a => a.id === 'account_a').status, 'INACTIVE');
  assert.equal(getEffectiveWorkerAccount('antigravity', options).account.id, 'account_b');
});

test('Codex standby requires a distinct profile before any login probe runs', t => {
  let probes = 0;
  const options = { ...fixture(t), probe: () => { probes++; return true; } };
  saveAccountSlot('codex', { accountId: 'account_b' }, options);
  assert.throws(() => checkAccountSlot('codex', 'account_b', {}, options), /独立/);
  assert.equal(probes, 0);
  const profile = path.join(path.dirname(options.poolFile), 'profile-b');
  saveAccountSlot('codex', { accountId: 'account_b', profilePath: profile }, options);
  assert.equal(checkAccountSlot('codex', 'account_b', {}, options).loggedIn, true);
  assert.throws(() => saveAccountSlot('codex', { accountId: 'account_a', profilePath: profile }, options), /不能共用/);
});

test('Login checks and timers cannot silently restore a cooling managed account', t => {
  const options = { ...fixture(t), probe: () => true };
  configureWorkerAccounts('codex', { accounts: { account_a: { id: 'account_a', managed: true, status: 'COOLDOWN', cooldownUntil: new Date(Date.now() + 60000).toISOString() } } }, options);
  assert.equal(checkAccountSlot('codex', 'account_a', {}, options).pool.accounts[0].status, 'COOLDOWN');
  assert.equal(publicAccountPool(manualResetAccount('codex', 'account_a', options)).accounts[0].status, 'NEEDS_CHECK');
  configureWorkerAccounts('codex', { accounts: { account_a: { id: 'account_a', managed: true, status: 'COOLDOWN', cooldownUntil: new Date(Date.now() - 1000).toISOString() } } }, options);
  assert.equal(getEffectiveWorkerAccount('codex', options).account.status, 'NEEDS_CHECK');
});

test('Execution refuses an unverified standby before starting its CLI', async t => {
  const options = fixture(t);
  const previous = process.env.ACCOUNT_POOLS_FILE;
  process.env.ACCOUNT_POOLS_FILE = options.poolFile;
  t.after(() => { if (previous === undefined) delete process.env.ACCOUNT_POOLS_FILE; else process.env.ACCOUNT_POOLS_FILE = previous; });
  configureWorkerAccounts('codex', { primaryAccountId: 'account_b', activeAccountId: 'account_b', accounts: {
    account_a: { id: 'account_a', status: 'INACTIVE' },
    account_b: { id: 'account_b', status: 'AVAILABLE', env: {} }
  } }, options);
  const result = await runAgent('codex', { title: '本地检查', description: '本地检查' }, path.dirname(options.poolFile), { dryRun: true, agents: {} });
  assert.equal(result.ok, false);
  assert.match(result.error, /ACCOUNT_NOT_READY/);
});
