import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const base = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3000';
const email = process.env.LOCAL_ADMIN_EMAIL ?? 'visual@local.test';
const password = process.env.LOCAL_ADMIN_PASSWORD ?? 'Visual-Local-Only!2026';
const out = process.env.VISUAL_OUTPUT ?? 'visual-artifacts/current';

await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1672, height: 941 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

async function snap(name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

async function go(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(450);
}

async function search(term, kind) {
  return page.evaluate(
    async ({ term, kind }) => {
      const response = await fetch('/api/search?q=' + encodeURIComponent(term));
      const data = await response.json();
      return data.results.find((item) => !kind || item.kind === kind)?.href ?? null;
    },
    { term, kind },
  );
}

await go('/login');
await snap('00-login');
await page.getByLabel('Email').fill(email);
await page.getByLabel('Password').fill(password);
await page.getByRole('button', { name: 'SIGN IN' }).click();
await page.waitForURL(/\/workspace|\/network|\/topology/);
await page.waitForTimeout(450);
await snap('14-operations');

await go('/network');
await snap('01-network');

const siteLink = await search('Lima', 'SITE');
if (siteLink) {
  await go(siteLink);
  await snap('02-site');
}

const structureLink = await search('Building A', 'STRUCTURE');
if (structureLink) {
  await go(structureLink);
  await snap('03-structure');
}

const levelLink = await search('Level 02', 'LEVEL');
if (levelLink) {
  await go(levelLink);
  await snap('04-level');
}

const roomLink = await search('Room 202', 'ROOM_SUBSTRUCTURE');
if (roomLink) {
  await go(roomLink);
  await snap('05-room-blueprint');
  const editButton = page.getByRole('button', { name: 'EDIT ROOM' }).first();
  if (await editButton.count()) {
    await editButton.click();
    await page.waitForTimeout(300);
    await snap('06-room-blueprint-edit');
  }
  await page.keyboard.press('Control+K');
  await page.getByLabel('Search infrastructure').fill('R-');
  await page.waitForTimeout(500);
  await snap('15-global-search');
  await page.keyboard.press('Escape');

}

const rackLink = await search('R-023', 'CONTAINER_RACK');
if (rackLink) {
  const focus = rackLink.endsWith('/focus')
    ? rackLink
    : rackLink.includes('/rack/')
      ? rackLink.replace(/\/$/, '') + '/focus'
      : rackLink;
  await go(focus);
  await snap('07-rack-focus');
  const elevation = focus.replace(/\/focus$/, '');
  await go(elevation);
  await snap('08-rack-elevation');
}

const deviceLink = await search('SERVER-01', 'DEVICE');
if (deviceLink) {
  await go(deviceLink);
  await snap('09-device-focus');
}

await go('/power?feed=AB');
await snap('10-power-path');
const powerTelemetryButton = page.getByRole('button', { name: 'TELEMETRY' }).first();
if (await powerTelemetryButton.count()) {
  await powerTelemetryButton.click();
  await page.waitForTimeout(400);
  await snap('13-telemetry-lens');
}

const bdfbLink = await search('BDFB-A', 'DEVICE');
if (bdfbLink) {
  await go(bdfbLink);
  await snap('11-bdfb');
  const panel = page.locator('.bdfb-overview-panel').first();
  if (await panel.count()) {
    await panel.click();
    await page.waitForTimeout(300);
    const breaker08 = page.locator('.bdfb-endpoint').nth(7);
    if (await breaker08.count()) {
      await breaker08.click();
      await page.waitForTimeout(250);
    }
    await snap('12-panel-breaker');
  }
}

await go('/settings');
await snap('16-settings');

await browser.close();
