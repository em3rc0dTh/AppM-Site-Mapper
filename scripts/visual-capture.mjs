import assert from 'node:assert/strict';
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
const createSite = page
  .locator('.operational-edit-dock summary')
  .filter({ hasText: 'Create site' });
if (/\/topology\/network\//.test(page.url())) {
  await createSite.waitFor({ state: 'visible', timeout: 10_000 });
  assert.ok(
    await createSite.isVisible(),
    'Editable Network must expose a visible Create site control inside the viewport',
  );
}
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

  // A successful screenshot alone does not prove the requested light theme.
  // Fail the visual gate if the operational surfaces regress to the dark palette.
  let roomColors;
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.locator('.zip-room-properties').waitFor({ state: 'visible', timeout: 15_000 });
    try {
      roomColors = await page.evaluate(() => {
        const color = (selector) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`Missing room element: ${selector}`);
          return getComputedStyle(element).backgroundColor;
        };
        return {
          topbar: color('.zip-topbar'),
          stage: color('.operational-stage'),
          inspector: color('.zip-room-properties'),
          draftingSurface: color('.blueprint-canvas-shell'),
        };
      });
      break;
    } catch (error) {
      // Next can replace the evaluation context while hydrating the deep link.
      if (attempt === 4 || !String(error).includes('Execution context was destroyed')) {
        throw error;
      }
      await page.waitForTimeout(500);
    }
  }
  assert.deepEqual(roomColors, {
    topbar: 'rgb(255, 255, 255)',
    stage: 'rgb(255, 255, 255)',
    inspector: 'rgb(255, 255, 255)',
    draftingSurface: 'rgb(248, 250, 252)',
  });

  await snap('05-room-blueprint');

  const rackInRoom = page.locator('.blueprint-rack-node').first();
  if (await rackInRoom.count()) {
    await rackInRoom.click();
    await page.locator('.mk-selection-inspector').waitFor({ state: 'visible' });
    await rackInRoom.dblclick();
    await page.getByRole('dialog', { name: 'Rack focus' }).waitFor({ state: 'visible' });
    await snap('07-rack-focus-popup');
    await page.getByRole('button', { name: 'Close rack focus' }).click();
  }

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
  const mountFromWarehouse = page.getByRole('button', { name: '+ MOUNT FROM WAREHOUSE' });
  await mountFromWarehouse.waitFor({ state: 'visible', timeout: 10_000 });
  assert.ok(
    await mountFromWarehouse.isVisible(),
    'Rack elevation must expose Mount from Warehouse',
  );

  await mountFromWarehouse.click();
  const formGeometry = await page.evaluate(() => {
    const form = document.querySelector('.rack-warehouse-form');
    if (!form) return null;
    const rect = form.getBoundingClientRect();
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  assert.ok(formGeometry, 'Warehouse mount form must render');
  assert.ok(formGeometry.top >= 0, 'Warehouse mount form is clipped above the viewport');
  assert.ok(formGeometry.left >= 0, 'Warehouse mount form is clipped left of the viewport');
  assert.ok(
    formGeometry.right <= formGeometry.viewportWidth,
    'Warehouse mount form is clipped right of the viewport',
  );
  assert.ok(
    formGeometry.bottom <= formGeometry.viewportHeight,
    'Warehouse mount form is clipped below the viewport',
  );
  await snap('08a-rack-mount-from-warehouse');
  await page.getByRole('button', { name: 'Close warehouse mount' }).click();

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
    await page.locator('.bdfb-endpoint').first().waitFor({ state: 'visible' });
    // A CSS-only regression previously collapsed the board to its header while
    // leaving every endpoint in the DOM. Check actual rendered dimensions.
    const boardGeometry = await page.evaluate(() => {
      const board = document.querySelector('.bdfb-panel-board--detail');
      const grid = document.querySelector('.bdfb-endpoint-grid');
      const endpoint = document.querySelector('.bdfb-endpoint');
      if (!board || !grid || !endpoint) return null;
      return {
        boardHeight: board.getBoundingClientRect().height,
        gridHeight: grid.getBoundingClientRect().height,
        endpointHeight: endpoint.getBoundingClientRect().height,
        endpointCount: grid.querySelectorAll('.bdfb-endpoint').length,
      };
    });
    assert.ok(boardGeometry, 'BDFB panel board and endpoints must exist');
    assert.ok(boardGeometry.endpointCount >= 1, 'Panel has no physical endpoints');
    assert.ok(boardGeometry.boardHeight >= 380, 'BDFB board collapsed inside viewport');
    assert.ok(boardGeometry.gridHeight >= 240, 'BDFB endpoint grid is clipped');
    assert.ok(boardGeometry.endpointHeight >= 22, 'BDFB breaker buttons are not visible');
    await snap('12a-panel-breaker-board');
    const breaker08 = page.locator('.bdfb-endpoint').nth(7);
    if (await breaker08.count()) {
      await breaker08.click();
      await page.waitForTimeout(250);
    }
    await snap('12-panel-breaker');
  }
}

await go('/warehouse');
await page.getByRole('heading', { name: 'Device & Equipment Templates' }).waitFor({
  state: 'visible',
  timeout: 10_000,
});
await snap('17-virtual-warehouse');

await go('/settings');
await snap('16-settings');

await browser.close();
