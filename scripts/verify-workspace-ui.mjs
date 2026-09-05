import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.OS_VERIFY_URL || 'http://127.0.0.1:3210';
fs.mkdirSync('outputs/os-audit', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (r.url().includes('/api/')) requests.push(new URL(r.url()).pathname); });
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#overviewApprovals').textContent !== '—');
  check('Live home connects and shows approval count', await page.locator('#health').textContent().then(t => t.includes('已连接')));
  check('Connected notice is hidden', !(await page.locator('#connectionNotice').isVisible()));
  check('Hidden modules are not fetched on home', !requests.some(r => /secretary|intelligence|content|memory|computer/.test(r)));
  check('Home is focused', !(await page.locator('#xhsIntelligenceSection').isVisible()) && !(await page.locator('#taskSection').isVisible()));
  await page.screenshot({ path: 'outputs/os-audit/desktop-home.png', fullPage: true });
  await page.locator('.primaryNav > a[href="#accountsSection"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.accountTool').length === 2);
  check('Both account pools are accessible on desktop', await page.locator('.accountSlot').count() === 4);
  check('Antigravity standby is shown as unlogged', await page.locator('.accountTool').first().textContent().then(t => t.includes('未登录')));
  await page.screenshot({ path: 'outputs/os-audit/desktop-accounts.png', fullPage: true });
  await page.locator('.primaryNav > a[href="#commandSection"]').click();

  // UI mutations below use synthetic responses; no live task or approval is changed.
  let tasks = [];
  let submissions = 0;
  let shouldFail = false;
  let highRisk = false;
  await page.route('**/api/tasks', async route => {
    if (route.request().method() === 'POST') {
      submissions++;
      if (shouldFail) return route.fulfill({ status: 503, json: { error: '测试：服务暂不可用' } });
      const payload = route.request().postDataJSON();
      const task = { ...payload, id: 'ui-fixture', status: highRisk ? 'awaiting_approval' : 'queued', riskLevel: highRisk ? 'high' : 'low', approvalStatus: highRisk ? 'pending' : 'not_required', riskReasons: [], createdAt: new Date().toISOString() };
      tasks = [task];
      return route.fulfill({ status: 201, json: task });
    }
    return route.fulfill({ json: tasks });
  });
  await page.route('**/api/approvals', route => route.fulfill({ json: highRisk ? tasks : [] }));
  await page.locator('[data-intent]').first().click();
  check('Example fills the input', (await page.locator('#description').inputValue()).length > 0);
  await page.locator('#description').fill('保留这段未提交的需求');
  await page.locator('[data-intent]').nth(1).click();
  check('Examples preserve an existing draft', await page.locator('#description').inputValue() === '保留这段未提交的需求');
  shouldFail = true;
  await page.locator('#create').click();
  await page.waitForFunction(() => !document.querySelector('#create').disabled);
  check('Failed submission keeps draft', await page.locator('#description').inputValue() === '保留这段未提交的需求');
  shouldFail = false;
  await page.locator('#create').click();
  await page.waitForFunction(() => document.body.dataset.view === 'taskSection');
  check('Successful submission opens progress', await page.locator('#taskSection').isVisible());
  check('Only intended submits are sent', submissions === 2);
  await page.locator('.primaryNav a[href="#commandSection"]').click();
  highRisk = true;
  await page.locator('#description').fill('用于界面验收的审批事项');
  await page.locator('#create').click();
  await page.waitForFunction(() => document.body.dataset.view === 'approvalSection');
  check('High-risk submission opens approvals', await page.locator('#approvalSection').isVisible());
  check('Approval is not automatically submitted', requests.every(r => !r.endsWith('/approve')));

  await page.locator('.primaryNav > a[href="#xhsIntelligenceSection"]').click();
  check('Intelligence navigation opens the correct panel', await page.locator('#xhsIntelligenceSection').isVisible());
  check('Intelligence replaces the home form', !(await page.locator('#commandSection').isVisible()));
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.view === 'xhsIntelligenceSection');
  check('Panel survives refresh via deep link', await page.locator('#xhsIntelligenceSection').isVisible());

  // Return to live home for screenshots; do not expose private secretary data.
  await page.unroute('**/api/tasks');
  await page.unroute('**/api/approvals');
  await page.goto(base + '/phone');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('#overviewApprovals').textContent !== '—');
  check('Phone layout fits the viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'outputs/os-audit/phone-home.png', fullPage: true });
  await page.locator('#mobileMoreToggle').click();
  check('Phone menu opens', await page.locator('#mobileMoreSheet').isVisible());
  await page.locator('#mobileMoreSheet a[href="#accountsSection"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.accountTool').length === 2);
  check('Account pools fit the phone viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'outputs/os-audit/phone-accounts.png', fullPage: true });
  await page.locator('#mobileMoreToggle').click();
  await page.locator('#mobileMoreSheet a[href="#xhsIntelligenceSection"]').click();
  check('Phone intelligence opens', await page.locator('#xhsIntelligenceSection').isVisible());
  check('Phone menu closes after navigation', !(await page.locator('#mobileMoreSheet').isVisible()));
  await page.locator('.mobileTab[href="#commandSection"]').click();
  await page.route('**/api/health', route => route.abort());
  await page.evaluate(() => refreshNow());
  check('Offline state is honest', await page.locator('body').getAttribute('data-connection') === 'offline');
  check('Offline recovery action is visible', await page.locator('#connectionNotice').isVisible());
  await page.unroute('**/api/health');
  await page.evaluate(() => refreshNow());
  check('Connection recovers without reload', await page.locator('body').getAttribute('data-connection') === 'online');
  await page.setViewportSize({ width: 768, height: 1024 });
  check('Tablet layout fits the viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('No browser script errors', errors.length === 0);
  fs.writeFileSync('outputs/os-audit/browser-checks.json', JSON.stringify({ checks, errors, passed: checks.length }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
} finally {
  await browser.close();
}
