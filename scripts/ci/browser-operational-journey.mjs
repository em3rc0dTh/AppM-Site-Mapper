#!/usr/bin/env node
import assert from 'node:assert/strict';

import { MongoClient } from 'mongodb';

if (
  process.env.CI_COMBINED_E2E !== 'true' ||
  !process.env.MONGODB_DB_NAME?.startsWith('site_mapper_http_ci_') ||
  !process.env.MONGODB_URI?.includes('127.0.0.1:27017')
) {
  throw new Error('Refusing browser acceptance outside ephemeral CI database');
}

const mongo = new MongoClient(process.env.MONGODB_URI);
let browser;
try {
  await mongo.connect();
  const db = mongo.db(process.env.MONGODB_DB_NAME);
  const panel = await db.collection('topology_nodes').findOne({
    kind: 'EQUIPMENT',
    name: 'CI LIMA Panel 24P',
  });
  const breaker = await db.collection('topology_nodes').findOne({
    kind: 'EQUIPMENT',
    name: 'CI LIMA Circuit Breaker 01',
  });
  assert.ok(panel?.id && breaker?.id, 'Browser fixtures missing');
  const { chromium } = await import('/tmp/mk1-playwright/node_modules/playwright/index.mjs');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const base = process.env.CI_HTTP_BASE_URL || 'http://127.0.0.1:3100';

  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  // Verify the actual user-facing language selector, not just catalog parity.
  const loginLocale = page.locator('.sm-locale-control select');
  await loginLocale.waitFor({ timeout: 30000 });
  await loginLocale.selectOption('es');
  await page.waitForFunction(() => document.documentElement.lang === 'es', { timeout: 30000 });
  await page.getByText('Iniciar sesión').first().waitFor({ timeout: 30000 });
  await loginLocale.selectOption('en');
  await page.waitForFunction(() => document.documentElement.lang === 'en', { timeout: 30000 });
  await page.getByText('Sign in').first().waitFor({ timeout: 30000 });
  console.log('[PASS] Chromium: login selector en→es→en updates document language and labels');

  await page.locator('input[name="email"]').fill('mk1-e2e-operator@local.test');
  await page.locator('input[name="password"]').fill('CI-Only-E2E-Strong-2026!');
  await page.getByRole('button', { name: 'SIGN IN' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 });
  console.log('[PASS] Real Chromium: interactive login redirects to authenticated workspace');

  await page.goto(base + '/device/' + panel.id, { waitUntil: 'domcontentloaded' });
  await page.getByText('CI LIMA Panel 24P').first().waitFor({ timeout: 30000 });
  await page.getByText('MQTT POINT COMMISSIONING').waitFor({ timeout: 30000 });
  await page.getByText('0_1_1').first().waitFor({ timeout: 30000 });
  console.log('[PASS] Real Chromium: created panel, commissioning and MQTT point rendered');

  await page.getByText('Point group 0_1').first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: '/tmp/mk1-operational-browser.png', fullPage: true });
  console.log('[PASS] Real Chromium: configured telemetry prefix visible on actual Equipment page');

  // The approved 22" full-HD layout is a non-negotiable baseline.
  // Laptop fixes must change only the effective viewport below 1600px.
  const deviceLayout = page.locator('.mk-device-layout');
  for (const [width, height, expectedColumns] of [
    [1920, 1080, [310, 405]],
    [1536, 864, [212, 292]],
    [1366, 768, [212, 292]],
    [1280, 800, [212, 292]],
    [1100, 720, [190, null]],
  ]) {
    await page.setViewportSize({ width, height });
    const geometry = await deviceLayout.evaluate((element) => {
      const cols = getComputedStyle(element)
        .gridTemplateColumns.split(/\s+/)
        .map((item) => parseFloat(item));
      const stage = element.querySelector('.zip-device-stage');
      const inspector = element.querySelector('.zip-device-inspector');
      return {
        cols,
        stageWidth: stage?.getBoundingClientRect().width ?? 0,
        inspectorWidth: inspector?.getBoundingClientRect().width ?? 0,
        viewportOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    const [left, right] = expectedColumns;
    assert.equal(geometry.cols.length, width === 1100 ? 2 : 3, `${width}px layout column count`);
    assert.ok(
      Math.abs(geometry.cols[0] - left) < 2,
      `${width}px topology width: ${geometry.cols[0]}`,
    );
    if (right !== null) {
      assert.ok(
        Math.abs(geometry.cols[2] - right) < 2,
        `${width}px inspector width: ${geometry.cols[2]}`,
      );
    }
    assert.ok(geometry.stageWidth > 550, `${width}px must preserve legible center stage`);
    assert.ok(geometry.inspectorWidth > 250, `${width}px must preserve visible inspector`);
    assert.ok(
      geometry.viewportOverflow <= 3,
      `${width}px unexpected document horizontal overflow: ${geometry.viewportOverflow}`,
    );
    if (width === 1920 || width === 1366) {
      await page.screenshot({
        path: `/tmp/mk1-operational-browser-${width}.png`,
        fullPage: true,
      });
    }
    console.log(`[PASS] Real Chromium: ${width}px laptop/desktop columns and horizontal overflow`);
  }

  // Region-level laptop regression: Explorer (Network→Site→Structure→Level)
  // and the Room Blueprint must keep canvas/property panes in their columns.
  const network = await db.collection('topology_nodes').findOne({
    kind: 'NETWORK',
    name: 'CI Two-Site Network',
  });
  const room = await db.collection('topology_nodes').findOne({
    kind: 'ROOM_SUBSTRUCTURE',
    name: 'CI LIMA Room',
  });
  assert.ok(network?.id && room?.id, 'Explorer and Room fixtures missing');

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(base + '/topology/network/' + network.id, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('.zip-explorer').waitFor({ timeout: 30000 });
  const explorerColumns = await page.locator('.zip-explorer').evaluate((element) =>
    getComputedStyle(element)
      .gridTemplateColumns.split(/\s+/)
      .map((part) => parseFloat(part)),
  );
  assert.equal(explorerColumns.length, 2, 'Laptop topology Explorer must show canvas + Inspector');
  assert.ok(
    Math.abs(explorerColumns[1] - 292) < 2,
    `1366px Explorer Inspector width: ${explorerColumns[1]}`,
  );
  console.log('[PASS] Real Chromium: laptop Network Explorer retains canvas and Inspector');

  for (const [width, expected, row] of [
    [1920, [310, 270], 1],
    [1366, [212, 270], 1],
    [1100, [190, null], 2],
  ]) {
    await page.setViewportSize({ width, height: 820 });
    await page.goto(base + '/blueprint/' + room.id, {
      waitUntil: 'domcontentloaded',
    });
    const layout = page.locator('.operational-page--blueprint .operational-layout--blueprint');
    await layout.waitFor({ timeout: 30000 });
    const geometry = await layout.evaluate((element) => {
      const css = getComputedStyle(element);
      const cols = css.gridTemplateColumns.split(/\s+/).map((part) => parseFloat(part));
      const tree = element.querySelector(':scope > .operational-context')?.getBoundingClientRect();
      const stage = element
        .querySelector(':scope > .operational-stage--wide')
        ?.getBoundingClientRect();
      const properties = element
        .querySelector(':scope > .zip-room-properties')
        ?.getBoundingClientRect();
      return {
        cols,
        tree: { x: tree?.x ?? 0, width: tree?.width ?? 0 },
        stage: { x: stage?.x ?? 0, width: stage?.width ?? 0, bottom: stage?.bottom ?? 0 },
        properties: { x: properties?.x ?? 0, y: properties?.y ?? 0, width: properties?.width ?? 0 },
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    assert.equal(
      geometry.cols.length,
      width === 1100 ? 2 : 3,
      `${width}px Room Blueprint layout columns`,
    );
    assert.ok(
      Math.abs(geometry.cols[0] - expected[0]) < 2,
      `${width}px Room topology width: ${geometry.cols[0]}`,
    );
    assert.ok(
      geometry.stage.x >= geometry.tree.x + geometry.tree.width - 2,
      `${width}px Room stage must be right of topology`,
    );
    assert.ok(geometry.stage.width > 550, `${width}px Room stage must be usable`);
    if (width === 1100) {
      assert.ok(
        geometry.properties.x >= geometry.stage.x - 2,
        'Compact laptop Room properties must not occupy the topology column',
      );
      assert.ok(
        geometry.properties.y >= geometry.stage.bottom - 3,
        'Compact laptop Room properties must follow the canvas',
      );
    } else {
      assert.ok(
        Math.abs(geometry.cols[2] - expected[1]) < 2,
        `${width}px Room properties width: ${geometry.cols[2]}`,
      );
      assert.ok(
        geometry.properties.x >= geometry.stage.x + geometry.stage.width - 2,
        `${width}px Room properties must be to the right of the canvas`,
      );
    }
    assert.ok(
      geometry.documentOverflow <= 3,
      `${width}px unexpected Blueprint horizontal overflow: ${geometry.documentOverflow}`,
    );
    if (width === 1366) {
      await page.screenshot({ path: '/tmp/mk1-operational-room-1366.png', fullPage: true });
    }
    console.log(`[PASS] Real Chromium: ${width}px Room Blueprint layout and properties alignment`);
  }
  // Bilingual authenticated journey must preserve links, inventory data and
  // approved 1920px layout. Technical identities must stay byte-for-byte.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(base + '/settings?tab=profile', { waitUntil: 'domcontentloaded' });
  const settingsLocale = page.locator('.sm-locale-control select');
  await settingsLocale.waitFor({ timeout: 30000 });
  await settingsLocale.selectOption('es');
  await page.waitForFunction(() => document.documentElement.lang === 'es', { timeout: 30000 });
  await page.goto(base + '/network', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.lang === 'es');
  await page.getByText('CI Two-Site Network').first().waitFor({ timeout: 30000 });
  await page.goto(base + '/blueprint/' + room.id, { waitUntil: 'domcontentloaded' });
  await page.getByText('PROPIEDADES DE LA SALA').waitFor({ timeout: 30000 });
  assert.ok(
    (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 3,
    'Spanish labels must not introduce horizontal overflow at approved 1920px',
  );
  await page.goto(base + '/device/' + panel.id, { waitUntil: 'domcontentloaded' });
  await page.getByText('CI LIMA Panel 24P').first().waitFor({ timeout: 30000 });
  await page.getByText('0_1_1').first().waitFor({ timeout: 30000 });

  // Verify server-rendered locale and navigation on every major operational route.
  const localeRoutes = [
    '/workspace',
    '/network',
    '/power',
    '/telemetry',
    '/warehouse',
    '/settings?tab=profile',
    '/topology/network/' + network.id,
    '/blueprint/' + room.id,
    '/device/' + panel.id,
  ];
  async function verifyLocaleRoutes(expectedLocale) {
    for (const route of localeRoutes) {
      let response;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          response = await page.goto(base + route, { waitUntil: 'domcontentloaded' });
          break;
        } catch (error) {
          if (!String(error).includes('net::ERR_ABORTED') || attempt === 3) throw error;
          console.warn(`[RETRY] ${expectedLocale} navigation ${route} aborted; attempt ${attempt + 1}`);
          await page.waitForLoadState('domcontentloaded').catch(() => undefined);
        }
      }
      assert.ok(response?.ok(), `${expectedLocale} route ${route} must return HTTP 200`);
      await page.waitForFunction(
        (locale) => document.documentElement.lang === locale,
        expectedLocale,
      );
      assert.ok(!new URL(page.url()).pathname.includes('/login'), `Session lost on ${route}`);
    }
    console.log(
      `[PASS] Chromium: ${expectedLocale} locale preserved across all 9 operational routes`,
    );
  }

  await verifyLocaleRoutes('es');
  await page.goto(base + '/settings?tab=profile', { waitUntil: 'domcontentloaded' });
  await page.locator('.sm-locale-control select').selectOption('en');
  await page.waitForFunction(() => document.documentElement.lang === 'en', { timeout: 30000 });
  await page.goto(base + '/network', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await verifyLocaleRoutes('en');
  console.log(
    '[PASS] Chromium: bilingual authenticated navigation, immutable inventory/MQTT identifiers and desktop geometry',
  );
} catch (error) {
  console.error('[FAIL] Browser operational check:', error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await mongo.close();
}
