import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3000';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Only isolated loopback LAB is allowed');
assert.ok(process.env.LOCAL_ADMIN_PASSWORD, 'Require explicit disposable LAB password');
const out = process.env.VISUAL_OUTPUT ?? 'visual-artifacts/current';
await mkdir(out, { recursive: true });
const checks = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(30_000);
  const anonymous = await context.request.get(base + '/api/power-trace/not-an-entity');
  assert.equal(anonymous.status(), 401);
  checks.push('Unauthenticated trace API denied');
  const page = await context.newPage();
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(
    () => document.querySelector('button.auth-submit')?.disabled === false,
  );
  await page
    .locator('input[name="email"]')
    .fill(process.env.LOCAL_ADMIN_EMAIL ?? 'visual@local.test');
  await page.locator('input[name="password"]').fill(process.env.LOCAL_ADMIN_PASSWORD);
  assert.ok(
    await page.locator('form.auth-form').evaluate((form) => form.checkValidity()),
    'Seeded login form must be valid before submit',
  );
  await page.getByRole('button', { name: 'SIGN IN' }).click();
  await page
    .waitForURL(/\/(?:workspace|network|topology|blueprint|rack|device|power)(?:\/|\?|$)/)
    .catch(async (error) => {
      console.error('Login failure', await page.locator('.auth-error').allTextContents());
      await page.screenshot({ path: `${out}/uat-trace-login-failure.png` });
      throw error;
    });
  const search = await context.request.get(base + '/api/search?q=Compute%20Node%2001');
  assert.equal(search.status(), 200);
  const results = (await search.json()).results;
  const device = results.find((entry) => entry.kind === 'DEVICE');
  const equipment = results.find((entry) => entry.kind === 'EQUIPMENT');
  assert.ok(device && equipment, 'Both Device and Equipment fixtures must exist');
  for (const entity of [device, equipment]) {
    const response = await context.request.get(base + '/api/power-trace/' + entity.id);
    assert.equal(response.status(), 200);
    const { trace } = await response.json();
    assert.ok(trace.feedA.length >= 1, 'Synthetic fixture must have an A route');
    assert.equal(trace.feedB.length, 0, 'Missing B route must not be invented');
    assert.ok(trace.feedA.every((leg) => leg.telemetry.status !== 'LIVE'));
    await page.goto(base + entity.href);
    const trigger = page.locator('a[href^="/workbench/power-trace?"]:visible').first();
    await trigger.waitFor({ state: 'visible' });
    const popupPromise = page.waitForEvent('popup');
    await trigger.click();
    const popup = await popupPromise;
    await popup.waitForURL(/\/workbench\/power-trace\?/);
    await popup.locator('.sm-trace-feed[data-feed="A"] .sm-trace-leg').first().waitFor();
    assert.equal(await popup.locator('.zip-topbar').count(), 0, 'Detached trace has no AppShell');
    assert.equal(await popup.locator('[role="dialog"]').count(), 0, 'Trace is not a modal');
    assert.equal(await popup.locator('.sm-trace-feed[data-feed="B"] .sm-trace-leg').count(), 0);
    assert.equal(await popup.getByText('No linked reference', { exact: true }).count(), 2);
    assert.ok(
      (await popup.locator('.sm-trace-document-note').first().innerText()).includes(
        'Names alone are not evidence',
      ),
    );
    assert.equal(await popup.locator('.sm-trace-status[data-status="LIVE"]').count(), 0);
    for (const width of [1440, 1366, 1024]) {
      await popup.setViewportSize({ width, height: 900 });
      const geometry = await popup.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert.ok(geometry.scroll <= geometry.width + 2, `Horizontal overflow at ${width}px`);
    }
    await popup.evaluate(() => {
      window.__uatPrintCalls = 0;
      window.print = () => {
        window.__uatPrintCalls++;
      };
    });
    await popup.getByRole('button', { name: 'Export PDF', exact: true }).click();
    await popup.getByRole('button', { name: 'Print', exact: true }).click();
    assert.equal(await popup.evaluate(() => window.__uatPrintCalls), 2);
    const pdf = await popup.pdf({
      path: `${out}/uat-trace-${entity.kind.toLowerCase()}.pdf`,
      format: 'A4',
      printBackground: true,
    });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 1000);
    await popup.screenshot({
      path: `${out}/uat-trace-${entity.kind.toLowerCase()}.png`,
      fullPage: true,
    });
    checks.push(
      `${entity.kind}: detached window, A route, absent B, no invented LIVE/Excel, 1440/1366/1024, print handlers and PDF generation`,
    );
    await popup.close();
  }
  await writeFile(
    `${out}/uat-power-trace.json`,
    JSON.stringify(
      {
        environment: 'synthetic LAB; no FIELD',
        checkedAt: new Date().toISOString(),
        result: 'PASS',
        checks,
        limitations: [
          'No client signature',
          'No real A3 electrical mapping',
          'PDF readability requires human review',
          'No role lacking telemetry:read exercised',
        ],
      },
      null,
      2,
    ) + '\n',
  );
  console.log('UAT_POWER_TRACE_BROWSER_PASS', checks.join('; '));
} finally {
  await browser.close();
}
