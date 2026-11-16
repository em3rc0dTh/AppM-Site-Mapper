/* Playwright browser-level checks against a disposable local Site Mapper. */
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.ALARM_RULE_TEST_BASE_URL || 'http://127.0.0.1:3000';
const email = process.env.LOCAL_ADMIN_EMAIL || 'alarm-ci@local.test';
const password = process.env.LOCAL_ADMIN_PASSWORD;
const dest = path.resolve('artifacts/alarm-rule-manager');
if (!password) throw new Error('LOCAL_ADMIN_PASSWORD is required');
mkdirSync(dest, { recursive: true });
const browserErrors = [];
const checks = [];

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const auth = await context.request.post(base + '/api/auth/login', {
      data: { email, password },
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(auth.status(), 200, 'Browser session authentication failed');
    const page = await context.newPage();
    page.on('pageerror', (error) => browserErrors.push(error.message));

    let response = await page.goto(base + '/alarms/rules', { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200, 'Rule Manager route failed');
    await page.locator('.sm-rule-manager').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('.sm-rule-list button').first().waitFor({ timeout: 20_000 });
    const catalogCount = await page.locator('.sm-rule-list button').count();
    assert.ok(catalogCount >= 11, 'Rule Catalog did not render all definitions');
    checks.push({ test: 'Rule Manager renders interactive catalog', result: 'PASS', count: catalogCount });
    await page.screenshot({ path: path.join(dest, 'rule-manager-catalog.png'), fullPage: true });

    await page.locator('.sm-rule-tabs button').nth(1).click();
    await page.locator('.sm-rule-profile-grid article').first().waitFor();
    assert.equal(await page.locator('.sm-rule-profile-grid article').count(), 9);
    const profileContent = await page.locator('.sm-rule-profile-grid').innerText();
    assert.match(profileContent, /54\.5/);
    assert.match(profileContent, /56\.5/);
    assert.match(profileContent, /59/);
    checks.push({ test: 'DC-48V-24CELL profile renders 9 reference settings', result: 'PASS' });
    await page.screenshot({ path: path.join(dest, 'dc-48v-profile.png'), fullPage: true });

    await page.locator('.sm-rule-tabs button').nth(2).click();
    await page.locator('.sm-rule-preview input').waitFor();
    checks.push({ test: 'Assignments / effective breaker inspector route renders', result: 'PASS' });

    await page.locator('.sm-rule-tabs button').nth(3).click();
    await page.locator('.sm-rule-table').waitFor();
    checks.push({ test: 'Policy History route renders', result: 'PASS' });

    response = await page.goto(base + '/alarms', { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200);
    await page.locator('.sm-alarm-center').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('a[href="/alarms/rules"]').first().waitFor();
    checks.push({ test: 'Alarm Center links to Rule Manager', result: 'PASS' });
    await page.screenshot({ path: path.join(dest, 'alarm-center.png'), fullPage: true });

    assert.deepEqual(browserErrors, [], 'Uncaught browser exceptions');
    checks.push({ test: 'No uncaught browser errors', result: 'PASS' });
    writeFileSync(path.join(dest, 'browser-acceptance.json'), JSON.stringify({
      at: new Date().toISOString(), checks,
      screenshots: ['rule-manager-catalog.png','dc-48v-profile.png','alarm-center.png'],
    }, null, 2) + '\n');
    console.log('BROWSER ACCEPTANCE PASS: ' + checks.length + ' checks');
  } finally {
    await browser.close();
  }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
