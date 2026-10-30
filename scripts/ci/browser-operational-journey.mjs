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
  await page.emulateMedia({ colorScheme: 'dark' });

  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  // The approved operational theme must be light even when the OS prefers dark.
  const initialTheme = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    input: getComputedStyle(document.querySelector('.auth-form input')).backgroundColor,
    locale: getComputedStyle(document.querySelector('.sm-locale-control select')).backgroundColor,
  }));
  assert.equal(initialTheme.theme, 'light');
  assert.equal(initialTheme.scheme, 'light');
  assert.equal(initialTheme.input, 'rgb(255, 255, 255)');
  assert.equal(initialTheme.locale, 'rgb(255, 255, 255)');
  console.log('[PASS] Chromium: light login theme and locale selector on initial render');

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
  await page.locator('a.zip-account').getByText('ADMIN').waitFor({ timeout: 30000 });

  // Reproduce the user's exact bug: a STANDARD user clicks the top-bar ADMIN
  // link and must remain logged in on personal Settings.
  const standardPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await standardPage.goto(base + '/login', { waitUntil: 'domcontentloaded' });
    await standardPage.locator('input[name="email"]').fill('mk1-standard-operator@local.test');
    await standardPage.locator('input[name="password"]').fill('Active-MK1-Standard-2026!');
    await standardPage.getByRole('button', { name: 'SIGN IN' }).click();
    await standardPage.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 30000,
    });
    await standardPage.locator('a.zip-account').getByText('MY ACCOUNT').waitFor({
      timeout: 30000,
    });
    await standardPage.locator('a.zip-account').click();
    await standardPage.waitForURL((url) => url.pathname === '/settings', {
      timeout: 30000,
    });
    await standardPage.locator('a[href="/settings?tab=profile"]').waitFor({
      timeout: 30000,
    });
    assert.equal(await standardPage.locator('a[href="/settings?tab=security"]').count(), 1);
    assert.equal(await standardPage.locator('a[href="/settings?tab=users"]').count(), 0);
    assert.equal(await standardPage.locator('a[href="/settings?tab=danger-zone"]').count(), 0);
    const sessionResponse = await standardPage.request.get(base + '/api/auth/session');
    assert.equal(sessionResponse.status(), 200);
    assert.equal((await sessionResponse.json()).user.role, 'STANDARD');
    await standardPage.goto(base + '/settings?tab=users', { waitUntil: 'domcontentloaded' });
    await standardPage
      .locator('a[href="/settings?tab=profile"][aria-current="page"]')
      .waitFor({ timeout: 30000 });
    assert.equal((await standardPage.request.get(base + '/api/auth/session')).status(), 200);
    // Translation is user-local; changing the STANDARD user's language must
    // change the account label without granting administrative privileges.
    await standardPage.goto(base + '/settings?tab=profile', {
      waitUntil: 'domcontentloaded',
    });
    await standardPage.locator('.sm-locale-control select').selectOption('es');
    await standardPage.waitForFunction(() => document.documentElement.lang === 'es', {
      timeout: 30000,
    });
    await standardPage.locator('a.zip-account').getByText('MI CUENTA').waitFor({
      timeout: 30000,
    });
    await standardPage.locator('.sm-locale-control select').selectOption('en');
    await standardPage.waitForFunction(() => document.documentElement.lang === 'en', {
      timeout: 30000,
    });
    console.log('[PASS] Chromium: STANDARD sees MY ACCOUNT / MI CUENTA and stays authenticated');
  } finally {
    await standardPage.close();
  }

  await page.goto(base + '/device/' + panel.id, { waitUntil: 'domcontentloaded' });
  await page.getByText('CI LIMA Panel 24P').first().waitFor({ timeout: 30000 });
  await page.getByText('MQTT POINT COMMISSIONING').waitFor({ timeout: 30000 });
  await page.getByText('0_1_1').first().waitFor({ timeout: 30000 });
  console.log('[PASS] Real Chromium: created panel, commissioning and MQTT point rendered');

  // Verify the new destructive workflow visually without submitting a deletion.
  await page.locator('.mk1-delete-entity > button').first().click();
  const englishDelete = page.getByRole('dialog');
  await englishDelete.getByText('Deletion scope').waitFor({ timeout: 30000 });
  await englishDelete
    .getByText('This entity has active descendants.', { exact: false })
    .waitFor({ timeout: 30000 });
  assert.equal(
    await englishDelete.getByRole('button', { name: 'Confirm deletion' }).isDisabled(),
    true,
    'Single deletion must remain blocked for a populated Equipment',
  );
  await englishDelete.getByRole('button', { name: 'Cancel' }).click();
  console.log('[PASS] Chromium: English deletion modal, descendant warning, disabled confirmation');

  // The language preference is managed from Settings, not the Device toolbar.
  await page.goto(base + '/settings?tab=profile', { waitUntil: 'domcontentloaded' });
  await page.locator('.sm-locale-control select').selectOption('es');
  await page.waitForFunction(() => document.documentElement.lang === 'es', { timeout: 30000 });
  await page.goto(base + '/device/' + panel.id, { waitUntil: 'domcontentloaded' });
  await page.locator('.mk1-delete-entity > button').first().waitFor({ timeout: 30000 });
  await page.locator('.mk1-delete-entity > button').first().click();
  const spanishDelete = page.getByRole('dialog');
  await spanishDelete.getByText('Alcance de la eliminación').waitFor({ timeout: 30000 });
  await spanishDelete
    .getByText('Esta entidad contiene descendientes activos.', { exact: false })
    .waitFor({ timeout: 30000 });
  assert.equal(
    await spanishDelete.getByRole('button', { name: 'Confirmar eliminación' }).isDisabled(),
    true,
  );
  await spanishDelete.getByRole('button', { name: 'Cancelar' }).click();
  await page.goto(base + '/settings?tab=profile', { waitUntil: 'domcontentloaded' });
  await page.locator('.sm-locale-control select').selectOption('en');
  await page.waitForFunction(() => document.documentElement.lang === 'en', { timeout: 30000 });
  await page.goto(base + '/device/' + panel.id, { waitUntil: 'domcontentloaded' });
  console.log('[PASS] Chromium: Spanish deletion modal, translated confirmation, en/es round-trip');

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
    [1063, 720, [190, null]],
    [1045, 720, [190, null]],
    [992, 720, [190, null]],
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
    assert.equal(geometry.cols.length, width <= 1199 ? 2 : 3, `${width}px layout column count`);
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

    const headerGeometry = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        const box = element?.getBoundingClientRect();
        return box
          ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width }
          : null;
      };
      return {
        search: rect('.mk-search-trigger'),
        alarm: rect('.sm-alarm-header'),
        actions: rect('.zip-topbar-actions'),
        breadcrumb: rect('.zip-device-breadcrumbs'),
        viewportWidth: window.innerWidth,
      };
    });
    for (const [name, box] of [
      ['Search', headerGeometry.search],
      ['Alarm', headerGeometry.alarm],
    ]) {
      assert.ok(box, `${width}px ${name} control missing`);
      assert.ok(box.width > 24, `${width}px ${name} control collapsed: ${box.width}`);
      assert.ok(box.left >= -1, `${width}px ${name} control clipped left: ${box.left}`);
      assert.ok(
        box.right <= headerGeometry.viewportWidth + 1,
        `${width}px ${name} control clipped right: ${box.right}`,
      );
    }
    assert.ok(
      headerGeometry.actions?.right <= headerGeometry.viewportWidth + 1,
      `${width}px topbar action cluster overflows viewport`,
    );
    if (headerGeometry.breadcrumb && headerGeometry.actions) {
      assert.ok(
        headerGeometry.breadcrumb.right <= headerGeometry.actions.left + 2,
        `${width}px breadcrumb overlaps Search/Alarm action cluster: breadcrumb=${headerGeometry.breadcrumb.right}, actions=${headerGeometry.actions.left}`,
      );
    }

    if (width === 1920 || width === 1366 || width === 1063 || width === 992) {
      await page.screenshot({
        path: `/tmp/mk1-operational-browser-${width}.png`,
        fullPage: true,
      });
    }
    console.log(
      `[PASS] Real Chromium: ${width}px Equipment layout, Search/Alarm visibility and overflow`,
    );
  }

  // Deep Equipment focus must retain the hierarchy all the way to a breaker,
  // including the sub-1000px desktop-like viewport that triggered the regression.
  for (const width of [1063, 992]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto(base + '/device/' + breaker.id, { waitUntil: 'domcontentloaded' });
    const tree = page.locator('.telxius-topology-tree');
    await tree.waitFor({ timeout: 30000 });
    await tree.getByText('CI LIMA BDFB', { exact: true }).waitFor({ timeout: 30000 });
    await tree.getByText('CI LIMA Panel 24P', { exact: true }).waitFor({ timeout: 30000 });
    await tree.getByText('CI LIMA Circuit Breaker 01', { exact: true }).waitFor({ timeout: 30000 });

    const activeGeometry = await tree.evaluate((element) => {
      const current = element.querySelector('a[aria-current="page"]');
      const active = current?.getBoundingClientRect();
      const host = element.getBoundingClientRect();
      return {
        active: active
          ? { top: active.top, bottom: active.bottom, left: active.left, right: active.right }
          : null,
        host: { top: host.top, bottom: host.bottom, left: host.left, right: host.right },
      };
    });
    assert.ok(activeGeometry.active, `${width}px active breaker missing from hierarchy`);
    assert.ok(
      activeGeometry.active.bottom >= activeGeometry.host.top &&
        activeGeometry.active.top <= activeGeometry.host.bottom,
      `${width}px active breaker exists but is outside the visible hierarchy viewport`,
    );
    assert.ok(
      activeGeometry.active.left >= activeGeometry.host.left - 1 &&
        activeGeometry.active.right <= activeGeometry.host.right + 1,
      `${width}px active breaker is horizontally clipped out of the hierarchy`,
    );
    await page.screenshot({
      path: `/tmp/mk1-operational-breaker-${width}.png`,
      fullPage: true,
    });
    console.log(`[PASS] Real Chromium: ${width}px deep Equipment hierarchy remains visible`);
  }

  // Return to the panel for the remaining operational journey.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(base + '/device/' + panel.id, { waitUntil: 'domcontentloaded' });

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
          console.warn(
            `[RETRY] ${expectedLocale} navigation ${route} aborted; attempt ${attempt + 1}`,
          );
          await page.waitForLoadState('domcontentloaded').catch(() => undefined);
        }
      }
      assert.ok(response?.ok(), `${expectedLocale} route ${route} must return HTTP 200`);
      await page.waitForFunction(
        (locale) => document.documentElement.lang === locale,
        expectedLocale,
      );
      const persistedTheme = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
      }));
      assert.equal(persistedTheme.theme, 'light', `Theme changed on ${expectedLocale} ${route}`);
      assert.equal(
        persistedTheme.colorScheme,
        'light',
        `Native color scheme changed on ${expectedLocale} ${route}`,
      );
      assert.ok(!new URL(page.url()).pathname.includes('/login'), `Session lost on ${route}`);
    }
    console.log(
      `[PASS] Chromium: ${expectedLocale} locale preserved across all 9 operational routes`,
    );
  }

  await verifyLocaleRoutes('es');

  // The add-user flyout is a white surface: its native fields cannot inherit
  // the legacy dark tokens when switching to Spanish.
  await page.goto(base + '/settings?tab=users', { waitUntil: 'domcontentloaded' });
  await page.getByText('CONFIGURACIÓN').first().waitFor({ timeout: 30000 });
  const addUser = page.locator('.zip-users-heading details');
  await addUser.locator('summary').click();
  const displayNameInput = page.locator('.settings-user-create input[name="displayName"]');
  await displayNameInput.waitFor({ timeout: 30000 });
  const addUserTheme = await page.evaluate(() => ({
    name: getComputedStyle(document.querySelector('.settings-user-create input')).backgroundColor,
    role: getComputedStyle(document.querySelector('.settings-user-create select')).backgroundColor,
  }));
  assert.equal(addUserTheme.name, 'rgb(255, 255, 255)');
  assert.equal(addUserTheme.role, 'rgb(255, 255, 255)');
  console.log(
    '[PASS] Chromium: Spanish user creation and native dropdowns retain white backgrounds',
  );

  // Wait for app hydration: DOMContentLoaded alone can expose an SSR select
  // before React attaches the onChange handler.
  await page.goto(base + '/settings?tab=profile', { waitUntil: 'networkidle' });
  await page.locator('.sm-locale-control select').selectOption('en');
  await page.waitForFunction(
    () => document.cookie.split('; ').includes('site_mapper_locale=en'),
    null,
    { timeout: 30000 },
  );
  // A new server request must honor the stored preference across modules.
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
