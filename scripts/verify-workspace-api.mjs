import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const real = process.argv.includes('--real');
const runMarker = 'OS_RUNTIME_OK_' + Date.now();
const runtimeWorkspace = path.resolve('outputs/os-audit/runtime-workspace');
if (real) {
  fs.mkdirSync(runtimeWorkspace, { recursive: true });
  fs.writeFileSync(path.join(runtimeWorkspace, 'AGENTS.md'), `# Runtime verification\nOnly create runtime-check.txt containing ${runMarker}. Do not use ponytail. Do not modify any other file. No network, publishing, payments, or external messages.\n`);
}

const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', './test-support/isolate-data.js', 'server.js'], {
  windowsHide: true,
  env: { ...process.env, AI_FOUNDER_OS_PORT: String(port), AI_FOUNDER_OS_HOST: '127.0.0.1', AI_FOUNDER_OS_DRY_RUN: real ? '' : 'true', AI_FOUNDER_OS_RETENTION_ENABLED: 'false' },
  stdio: ['ignore', 'ignore', 'pipe']
});
let startupError = '';
child.stderr.on('data', chunk => { startupError = (startupError + chunk).slice(-6000); });
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/api/tasks')).ok) { ready = true; break; } } catch {}
    if (child.exitCode !== null) throw new Error('Isolated server exited before startup: ' + startupError);
    await delay(200);
  }
  check('Actual server starts with isolated task storage', ready);
  check('Isolated task ledger is initially empty', (await (await fetch(base + '/api/tasks')).json()).length === 0);
  check('Unknown API returns JSON 404', (await fetch(base + '/api/no-such-route')).status === 404);
  check('Empty task is rejected', (await post('/api/tasks', {})).status === 400);
  const response = await post('/api/tasks', {
    title: '本地软件运行验收',
    description: real ? `请在当前项目创建 runtime-check.txt，内容精确为 ${runMarker}。完成后报告 ARTIFACT: runtime-check.txt。此次验收不要使用马尾辫技能。` : '生成一份本地项目说明。',
    agent: 'codex',
    ...(real ? { projectPath: runtimeWorkspace, acceptanceCriteria: [{ type: 'file-equals', path: 'runtime-check.txt', value: runMarker, trim: true }] } : {})
  });
  check('Task can be submitted to the actual server', response.status === 201);
  let task = await response.json();
  for (let i = 0; i < (real ? 2400 : 100); i++) {
    task = await (await fetch(base + '/api/tasks/' + task.id)).json();
    if (['completed', 'failed', 'blocked', 'waiting_for_capacity'].includes(task.status)) break;
    await delay(100);
  }
  if (real) {
    fs.writeFileSync('outputs/os-audit/real-runtime-status.json', JSON.stringify({ status: task.status, agent: task.agentResolved, dryRun: task.result?.dryRun, verification: task.verification, error: task.error, resultError: task.result?.error, executionHistory: task.executionHistory?.map(h => ({ agent: h.agent, phase: h.phase, ok: h.ok, error: h.error, exitCode: h.exitCode })) }, null, 2));
  }
  check(real ? 'Real worker creates the exact verified artifact' : 'Dry-run dispatch reaches completed', task.status === 'completed');
  if (real) {
    check('Execution was not simulated', task.result?.dryRun !== true);
    check('Machine verification passed', task.verification?.ok === true);
    check('Artifact is registered for delivery', task.deliverables?.artifacts?.some(a => a.path.endsWith('runtime-check.txt')));
  }
  check('Task records the selected worker', task.agentResolved === 'codex');
  const approval = await (await post('/api/tasks', { title: '审批阻断验收', description: '发布内容到外部平台', agent: 'codex', riskLevel: 'high' })).json();
  check('High-risk task stops before dispatch', approval.status === 'awaiting_approval');
  check('High-risk task is visible in actual approval queue', (await (await fetch(base + '/api/approvals')).json()).some(t => t.id === approval.id));
  check('Direct run cannot bypass approval', (await post('/api/tasks/' + approval.id + '/run', {})).status === 403);
  const accounts = await (await fetch(base + '/api/workforce/accounts')).json();
  check('Account API returns two supported tool pools', accounts.pools.length === 2);
  check('Account API excludes environment credentials', !JSON.stringify(accounts).includes('"env"'));
  const standby = await (await post('/api/workforce/accounts/antigravity/configure', { accountId: 'account_b' })).json();
  check('New standby remains unlogged and unavailable', standby.pool.accounts.find(a => a.id === 'account_b').status === 'AUTH_REQUIRED');
  check('Third account is rejected', (await post('/api/workforce/accounts/antigravity/configure', { accountId: 'account_c' })).status === 400);
  check('HTTP cannot directly set arbitrary credential environment', (await post('/api/workforce/accounts/codex/configure', { env: { TEST: 'fixture-only' } })).status === 400);
  check('Antigravity check requires current-account confirmation', (await post('/api/workforce/accounts/antigravity/check', { accountId: 'account_b' })).status === 400);
  fs.mkdirSync('outputs/os-audit', { recursive: true });
  fs.writeFileSync(`outputs/os-audit/${real ? 'real-runtime-checks' : 'api-checks'}.json`, JSON.stringify({ mode: real ? 'isolated-real-worker' : 'isolated-dry-run', checks, passed: checks.length }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  child.kill();
}
