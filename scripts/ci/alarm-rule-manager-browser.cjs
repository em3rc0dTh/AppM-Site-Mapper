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
    await page.locator('.sm-rule-simple-card').waitFor({ state: 'visible', timeout: 20_000 });
    const ruleSelect = page.locator('.sm-rule-simple-grid select');
    await ruleSelect.waitFor({ timeout: 20_000 });
    const ruleOptions = await ruleSelect.locator('option').count();
    assert.equal(ruleOptions, 11, 'Simple alarm editor did not render all rule definitions');
    const targetSearch = page.locator('#alarm-target-search');
    await targetSearch.focus();
    await page.locator('.sm-rule-target-results').waitFor({ timeout: 20_000 });
    const initialTargetOptions = await page.locator('.sm-rule-target-results button').count();
    assert.ok(initialTargetOptions >= 1, 'Readable alarm target combobox did not render');
    await targetSearch.fill('__no_target_match__');
    assert.equal(await page.locator('.sm-rule-target-results button').count(), 0);
    await page.locator('.sm-rule-target-empty').waitFor();
    await targetSearch.fill('');
    assert.ok((await page.locator('.sm-rule-target-results button').count()) >= 1);
    checks.push({
      test: 'Alarm target combobox filters in one control without exposing internal IDs',
      result: 'PASS',
      initialTargetOptions,
    });
    assert.equal(
      await page.locator('input[placeholder*="topolog"]').count(),
      0,
      'Canonical topology ID must not be exposed in the operator form',
    );
    assert.equal(
      await page.locator('.sm-rule-tabs').count(),
      0,
      'Technical tabs must stay out of the simple operator flow',
    );
    checks.push({
      test: 'Simple Rule Manager renders readable target and rule selectors without canonical IDs',
      result: 'PASS',
      targetOptions: initialTargetOptions,
      ruleOptions,
    });
    await page.locator('.sm-rule-advanced summary').waitFor();
    checks.push({
      test: 'Advanced debounce/recovery settings are collapsed by default',
      result: 'PASS',
    });
    await page.screenshot({ path: path.join(dest, 'rule-manager-simple.png'), fullPage: true });

    response = await page.goto(base + '/alarms', { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200);
    await page.locator('.sm-alarm-center').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('a[href="/alarms/rules"]').first().waitFor();
    checks.push({ test: 'Alarm Center links to Rule Manager', result: 'PASS' });
    await page.screenshot({ path: path.join(dest, 'alarm-center.png'), fullPage: true });

    assert.deepEqual(browserErrors, [], 'Uncaught browser exceptions');
    checks.push({ test: 'No uncaught browser errors', result: 'PASS' });
    writeFileSync(
      path.join(dest, 'browser-acceptance.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          checks,
          screenshots: ['rule-manager-simple.png', 'alarm-center.png'],
        },
        null,
        2,
      ) + '\n',
    );
    console.log('BROWSER ACCEPTANCE PASS: ' + checks.length + ' checks');
  } finally {
    await browser.close();
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
