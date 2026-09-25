import { randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { MongoClient } from 'mongodb';
import {
  topologyDocuments,
  syntheticHistoryDocuments,
  ENTITY_ID,
  SERIAL_NUMBER,
} from '../../scripts/fixtures/physical-demo.mjs';
import { buildSyntheticCycle } from '../../scripts/telemetry-simulator/generator.mjs';

// Deliberately real auth + Mongo + ingest + authenticated SSE. No mocked network routes.
const password = `Cert-${randomBytes(20).toString('hex')}!9`;
const email = 'physical-flow@example.invalid';
let db,
  client,
  message = 2000;
const paths = new Map();
const names = [
  'Synthetic Demo Network',
  'Synthetic Demo Site',
  'Synthetic Demo Structure',
  'Synthetic Demo Level',
  'Synthetic Demo Room',
  'Synthetic Demo Bay',
  'A1',
  'Synthetic Demo Rack',
  'Synthetic QDF / BDFB',
];

async function screenshot(page, info, name) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
}
async function login(page) {
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Enter control center' }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}
async function feed(request, cycle) {
  const frames = buildSyntheticCycle({
    serialNumber: SERIAL_NUMBER,
    cycle,
    firstMessageId: message,
    epochSeconds: Math.floor(Date.now() / 1000),
    seed: 251107,
  });
  message += 3;
  for (const payload of frames) {
    const response = await request.post('/api/telemetry/ingest', {
      data: { topic: 'appmanager/v1/raw/demo-qdf-01/telemetry', payload },
    });
    expect(response.status()).toBe(202);
  }
}
async function noDocumentOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function expectSelection(page, name) {
  await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('.context-tree [aria-current="page"]')).toContainText(name);
  await expect(page.locator('.operational-breadcrumbs [aria-current="page"]')).toHaveText(name);
  await noDocumentOverflow(page);
}

async function navigateToDevice(page, collectedPaths = null) {
  await page.goto('/network');
  await page
    .getByRole('link', { name: /Synthetic Demo Network/ })
    .first()
    .click();

  for (let index = 0; index < names.length - 1; index++) {
    await expectSelection(page, names[index]);
    collectedPaths?.set(names[index], new URL(page.url()).pathname);
    const stage = page.locator('.operational-stage');

    if (index === 7) {
      await stage.getByRole('link', { name: 'Open Synthetic QDF / BDFB', exact: true }).click();
    } else {
      await stage.getByRole('link', { name: new RegExp(names[index + 1]) }).click();
    }
  }

  await expectSelection(page, names.at(-1));
  const devicePath = new URL(page.url()).pathname;
  collectedPaths?.set(names.at(-1), devicePath);
  return devicePath;
}

test.beforeAll(async ({ request }) => {
  const database = process.env.MONGODB_DB_NAME;
  if (!database?.startsWith('appm_flow_cert_'))
    throw new Error('Dedicated certification database required.');
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(database);
  await db.dropDatabase();
  const now = new Date().toISOString();
  await db.collection('topology_nodes').insertMany(topologyDocuments(now));
  await db.collection('telemetry_sources').insertOne({
    id: 'sim-demo-qdf-01',
    entityId: ENTITY_ID,
    entityKind: 'DEVICE',
    topicSource: 'demo-qdf-01',
    expectedSerialNumber: SERIAL_NUMBER,
    protocolProfile: 'myems-appm-breaker-v1',
    rawSchemaVersion: 'legacy-appm-v1',
    staleAfterSeconds: 30,
    enabled: true,
    simulated: true,
  });
  await db.collection('telemetry_demo_history').insertMany(syntheticHistoryDocuments(now));
  const response = await request.post('/api/auth/bootstrap', {
    headers: { authorization: `Bearer ${process.env.BOOTSTRAP_ADMIN_TOKEN}` },
    data: { email, password, displayName: 'Synthetic certification operator' },
  });
  expect(response.status()).toBe(201);
});
test.afterAll(async () => {
  await client?.close();
});

test('golden path, live popup, history, keyboard, canonical links and recovery', async ({
  page,
}, info) => {
  await page.goto('/login');
  await login(page);
  await page.goto('/network');
  await page
    .getByRole('link', { name: /Synthetic Demo Network/ })
    .first()
    .click();
  for (let index = 0; index < names.length; index++) {
    const name = names[index];
    await expectSelection(page, name);
    paths.set(name, new URL(page.url()).pathname);
    await screenshot(
      page,
      info,
      `flow-${index}-${['network', 'site', 'structure', 'level', 'room', 'bay', 'position', 'rack', 'device'][index]}`,
    );
    await page.reload();
    await expectSelection(page, name);
    if (index > 0) {
      await page.goBack();
      await expectSelection(page, names[index - 1]);
      await page.goForward();
      await expectSelection(page, name);
    }
    if (index === 4)
      await expect(page.getByText('No room boundary', { exact: false })).toBeVisible();
    if (index < names.length - 1) {
      const stage = page.locator('.operational-stage');
      if (index === 7)
        await stage.getByRole('link', { name: 'Open Synthetic QDF / BDFB', exact: true }).click();
      else await stage.getByRole('link', { name: new RegExp(names[index + 1]) }).click();
    }
  }
  const buttons = page.locator('.bdfb-endpoint');
  await expect(buttons).toHaveCount(24);
  await expect(
    page.locator('.bdfb-endpoint-column').nth(0).locator('.bdfb-endpoint-index'),
  ).toHaveText(Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')));
  await expect(
    page.locator('.bdfb-endpoint-column').nth(1).locator('.bdfb-endpoint-index'),
  ).toHaveText(Array.from({ length: 12 }, (_, i) => String(i + 13)));
  await expect(buttons.first()).toContainText('NO DATA');
  await expect(buttons.first()).toHaveClass(/--breaker/);
  await feed(page.request, 0);
  await expect(page.getByText('SIMULATED · LIVE', { exact: true })).toBeVisible();
  await expect(buttons.nth(12)).toContainText('STATE ONLY');
  await expect(buttons.nth(12)).toHaveClass(/--breaker/);
  const before = await page.locator('.bdfb-shelf').boundingBox();
  const breaker = page.getByRole('button', { name: 'Open CB-01 · BREAKER', exact: true });
  await breaker.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('demo-breaker-panel-1-1');
  await expect(dialog).toContainText('Frame 1 · implicit');
  const after = await page.locator('.bdfb-shelf').boundingBox();
  expect(after).toEqual(before);
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await dialog.getByRole('tab', { name: 'Realtime telemetry' }).click();
  const value = dialog
    .locator('.inspector-facts > div')
    .filter({ has: page.locator('dt', { hasText: /^U1$/ }) })
    .locator('dd');
  const received = dialog
    .locator('.inspector-facts > div')
    .filter({ has: page.locator('dt', { hasText: /^Last received$/ }) })
    .locator('dd');
  const priorValue = await value.textContent(),
    priorReceived = await received.textContent();
  await feed(page.request, 12);
  await expect(value).not.toHaveText(priorValue);
  await expect(received).not.toHaveText(priorReceived);
  await expect(dialog.getByRole('tab', { name: 'Realtime telemetry' })).toBeFocused();
  await expect(dialog.getByRole('tab', { name: 'Realtime telemetry' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await screenshot(page, info, 'breaker-realtime');
  await dialog.getByRole('tab', { name: 'History', exact: true }).click();
  for (const range of ['24H', '7D', '30D']) {
    await dialog.getByRole('button', { name: range, exact: true }).click();
    await expect(dialog.getByText('SYNTHETIC HISTORY', { exact: false })).toBeVisible();
    await expect(dialog.locator('polyline')).toHaveCount(1);
    await screenshot(page, info, `history-${range}`);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(breaker).toBeFocused();
  await page.getByRole('button', { name: 'Open CB-13 · BREAKER', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Realtime telemetry' }).click();
  await expect(dialog.locator('dt').filter({ hasText: /^(U1|I1|P1)$/ })).toHaveCount(0);
  await expect(dialog).toContainText('ONLINE');
  await dialog.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(dialog.getByText('State-only history')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close inspector' }).click();
  await expect(dialog).not.toBeVisible();
  await breaker.click();
  await page.mouse.click(3, 3);
  await expect(dialog).not.toBeVisible();
  await expect(breaker).toBeFocused();
});

test('canonical rack navigation, deep-link recovery and surveyed room continuity', async ({
  page,
}) => {
  await page.goto('/login');
  await login(page);

  const recoveredPaths = new Map();
  const devicePath = await navigateToDevice(page, recoveredPaths);

  await page
    .getByRole('navigation', { name: 'Breadcrumb', exact: true })
    .getByRole('link', { name: 'Synthetic Demo Rack', exact: true })
    .click();
  await expect(page).toHaveURL(/\/rack\/demo-rack$/);
  recoveredPaths.set('Synthetic Demo Rack', new URL(page.url()).pathname);

  await page.goBack();
  await expectSelection(page, names[8]);
  await page.goForward();
  await expect(page).toHaveURL(/\/rack\/demo-rack$/);
  await page.goBack();
  await expectSelection(page, names[8]);

  for (const name of [
    'Synthetic Demo Site',
    'Synthetic Demo Room',
    'Synthetic Demo Rack',
    'Synthetic QDF / BDFB',
  ]) {
    const path = recoveredPaths.get(name);
    expect(path).toBeTruthy();

    await page.goto(path);
    await expectSelection(page, name);
    await page.reload();
    await expectSelection(page, name);

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
    await login(page);
    await expect(page).toHaveURL(new RegExp(`${path}import { randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { MongoClient } from 'mongodb';
import {
  topologyDocuments,
  syntheticHistoryDocuments,
  ENTITY_ID,
  SERIAL_NUMBER,
} from '../../scripts/fixtures/physical-demo.mjs';
import { buildSyntheticCycle } from '../../scripts/telemetry-simulator/generator.mjs';

// Deliberately real auth + Mongo + ingest + authenticated SSE. No mocked network routes.
const password = `Cert-${randomBytes(20).toString('hex')}!9`;
const email = 'physical-flow@example.invalid';
let db,
  client,
  message = 2000;
const paths = new Map();
const names = [
  'Synthetic Demo Network',
  'Synthetic Demo Site',
  'Synthetic Demo Structure',
  'Synthetic Demo Level',
  'Synthetic Demo Room',
  'Synthetic Demo Bay',
  'A1',
  'Synthetic Demo Rack',
  'Synthetic QDF / BDFB',
];

async function screenshot(page, info, name) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
}
async function login(page) {
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Enter control center' }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}
async function feed(request, cycle) {
  const frames = buildSyntheticCycle({
    serialNumber: SERIAL_NUMBER,
    cycle,
    firstMessageId: message,
    epochSeconds: Math.floor(Date.now() / 1000),
    seed: 251107,
  });
  message += 3;
  for (const payload of frames) {
    const response = await request.post('/api/telemetry/ingest', {
      data: { topic: 'appmanager/v1/raw/demo-qdf-01/telemetry', payload },
    });
    expect(response.status()).toBe(202);
  }
}
async function noDocumentOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function expectSelection(page, name) {
  await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('.context-tree [aria-current="page"]')).toContainText(name);
  await expect(page.locator('.operational-breadcrumbs [aria-current="page"]')).toHaveText(name);
  await noDocumentOverflow(page);
}

async function navigateToDevice(page, collectedPaths = null) {
  await page.goto('/network');
  await page
    .getByRole('link', { name: /Synthetic Demo Network/ })
    .first()
    .click();

  for (let index = 0; index < names.length - 1; index++) {
    await expectSelection(page, names[index]);
    collectedPaths?.set(names[index], new URL(page.url()).pathname);
    const stage = page.locator('.operational-stage');

    if (index === 7) {
      await stage.getByRole('link', { name: 'Open Synthetic QDF / BDFB', exact: true }).click();
    } else {
      await stage.getByRole('link', { name: new RegExp(names[index + 1]) }).click();
    }
  }

  await expectSelection(page, names.at(-1));
  const devicePath = new URL(page.url()).pathname;
  collectedPaths?.set(names.at(-1), devicePath);
  return devicePath;
}

test.beforeAll(async ({ request }) => {
  const database = process.env.MONGODB_DB_NAME;
  if (!database?.startsWith('appm_flow_cert_'))
    throw new Error('Dedicated certification database required.');
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(database);
  await db.dropDatabase();
  const now = new Date().toISOString();
  await db.collection('topology_nodes').insertMany(topologyDocuments(now));
  await db.collection('telemetry_sources').insertOne({
    id: 'sim-demo-qdf-01',
    entityId: ENTITY_ID,
    entityKind: 'DEVICE',
    topicSource: 'demo-qdf-01',
    expectedSerialNumber: SERIAL_NUMBER,
    protocolProfile: 'myems-appm-breaker-v1',
    rawSchemaVersion: 'legacy-appm-v1',
    staleAfterSeconds: 30,
    enabled: true,
    simulated: true,
  });
  await db.collection('telemetry_demo_history').insertMany(syntheticHistoryDocuments(now));
  const response = await request.post('/api/auth/bootstrap', {
    headers: { authorization: `Bearer ${process.env.BOOTSTRAP_ADMIN_TOKEN}` },
    data: { email, password, displayName: 'Synthetic certification operator' },
  });
  expect(response.status()).toBe(201);
});
test.afterAll(async () => {
  await client?.close();
});

test('golden path, live popup, history, keyboard, canonical links and recovery', async ({
  page,
}, info) => {
  await page.goto('/login');
  await login(page);
  await page.goto('/network');
  await page
    .getByRole('link', { name: /Synthetic Demo Network/ })
    .first()
    .click();
  for (let index = 0; index < names.length; index++) {
    const name = names[index];
    await expectSelection(page, name);
    paths.set(name, new URL(page.url()).pathname);
    await screenshot(
      page,
      info,
      `flow-${index}-${['network', 'site', 'structure', 'level', 'room', 'bay', 'position', 'rack', 'device'][index]}`,
    );
    await page.reload();
    await expectSelection(page, name);
    if (index > 0) {
      await page.goBack();
      await expectSelection(page, names[index - 1]);
      await page.goForward();
      await expectSelection(page, name);
    }
    if (index === 4)
      await expect(page.getByText('No room boundary', { exact: false })).toBeVisible();
    if (index < names.length - 1) {
      const stage = page.locator('.operational-stage');
      if (index === 7)
        await stage.getByRole('link', { name: 'Open Synthetic QDF / BDFB', exact: true }).click();
      else await stage.getByRole('link', { name: new RegExp(names[index + 1]) }).click();
    }
  }
  const buttons = page.locator('.bdfb-endpoint');
  await expect(buttons).toHaveCount(24);
  await expect(
    page.locator('.bdfb-endpoint-column').nth(0).locator('.bdfb-endpoint-index'),
  ).toHaveText(Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')));
  await expect(
    page.locator('.bdfb-endpoint-column').nth(1).locator('.bdfb-endpoint-index'),
  ).toHaveText(Array.from({ length: 12 }, (_, i) => String(i + 13)));
  await expect(buttons.first()).toContainText('NO DATA');
  await expect(buttons.first()).toHaveClass(/--breaker/);
  await feed(page.request, 0);
  await expect(page.getByText('SIMULATED · LIVE', { exact: true })).toBeVisible();
  await expect(buttons.nth(12)).toContainText('STATE ONLY');
  await expect(buttons.nth(12)).toHaveClass(/--breaker/);
  const before = await page.locator('.bdfb-shelf').boundingBox();
  const breaker = page.getByRole('button', { name: 'Open CB-01 · BREAKER', exact: true });
  await breaker.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('demo-breaker-panel-1-1');
  await expect(dialog).toContainText('Frame 1 · implicit');
  const after = await page.locator('.bdfb-shelf').boundingBox();
  expect(after).toEqual(before);
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await dialog.getByRole('tab', { name: 'Realtime telemetry' }).click();
  const value = dialog
    .locator('.inspector-facts > div')
    .filter({ has: page.locator('dt', { hasText: /^U1$/ }) })
    .locator('dd');
  const received = dialog
    .locator('.inspector-facts > div')
    .filter({ has: page.locator('dt', { hasText: /^Last received$/ }) })
    .locator('dd');
  const priorValue = await value.textContent(),
    priorReceived = await received.textContent();
  await feed(page.request, 12);
  await expect(value).not.toHaveText(priorValue);
  await expect(received).not.toHaveText(priorReceived);
  await expect(dialog.getByRole('tab', { name: 'Realtime telemetry' })).toBeFocused();
  await expect(dialog.getByRole('tab', { name: 'Realtime telemetry' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await screenshot(page, info, 'breaker-realtime');
  await dialog.getByRole('tab', { name: 'History', exact: true }).click();
  for (const range of ['24H', '7D', '30D']) {
    await dialog.getByRole('button', { name: range, exact: true }).click();
    await expect(dialog.getByText('SYNTHETIC HISTORY', { exact: false })).toBeVisible();
    await expect(dialog.locator('polyline')).toHaveCount(1);
    await screenshot(page, info, `history-${range}`);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(breaker).toBeFocused();
  await page.getByRole('button', { name: 'Open CB-13 · BREAKER', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Realtime telemetry' }).click();
  await expect(dialog.locator('dt').filter({ hasText: /^(U1|I1|P1)$/ })).toHaveCount(0);
  await expect(dialog).toContainText('ONLINE');
  await dialog.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(dialog.getByText('State-only history')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close inspector' }).click();
  await expect(dialog).not.toBeVisible();
  await breaker.click();
  await page.mouse.click(3, 3);
  await expect(dialog).not.toBeVisible();
  await expect(breaker).toBeFocused();
));
    await expectSelection(page, name);
  }

  await page.goto(devicePath.slice(0, devicePath.lastIndexOf('/device/')));
  await expect(page).toHaveURL(/\/rack\/demo-rack$/);

  await db.collection('topology_nodes').updateOne(
    { id: 'demo-room' },
    {
      $set: {
        polygon: [
          { x: 0, y: 0 },
          { x: 3600, y: 0 },
          { x: 3600, y: 2400 },
          { x: 0, y: 2400 },
        ],
      },
    },
  );

  await page.goto(recoveredPaths.get('Synthetic Demo Room'));
  await expect(page.getByRole('group', { name: 'Room blueprint' })).toBeVisible();
  await page
    .locator('.operational-stage')
    .getByRole('link', { name: /Synthetic Demo Bay/ })
    .click();
  await expectSelection(page, names[5]);
});

test('viewport matrix and physical endpoint semantics', async ({ page }, info) => {
  await page.goto('/login');
  await login(page);
  const devicePath = await navigateToDevice(page);
  expect(devicePath).toBeTruthy();
  await feed(page.request, 20);
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1280, 720],
    [1100, 800],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await noDocumentOverflow(page);
    const rows = page.locator('.bdfb-endpoint');
    await expect(rows).toHaveCount(24);
    if (width >= 1100) {
      const bands = await rows.evaluateAll((elements) =>
        elements.map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: el.clientWidth,
            content: el.scrollWidth,
            font: parseFloat(getComputedStyle(el.querySelector('.bdfb-endpoint-summary')).fontSize),
          };
        }),
      );
      for (const band of bands) {
        expect(band.top).toBeGreaterThan(0);
        expect(band.bottom).toBeLessThanOrEqual(height);
        expect(band.left).toBeGreaterThanOrEqual(0);
        expect(band.right).toBeLessThanOrEqual(width);
        expect(band.content).toBeLessThanOrEqual(band.width);
        expect(band.font).toBeGreaterThanOrEqual(12);
      }
      const scrollers = await page
        .locator('.bdfb-chassis *')
        .evaluateAll(
          (elements) =>
            elements.filter(
              (el) =>
                ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) &&
                el.scrollHeight > el.clientHeight + 1,
            ).length,
        );
      expect(scrollers).toBe(0);
    }
    await screenshot(page, info, `bdfb-${width}x${height}`);
    await page.getByRole('button', { name: 'Open CB-01 · BREAKER', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Realtime telemetry' }).click();
    const rect = await dialog.boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    await screenshot(page, info, `popup-${width}x${height}`);
    await page.keyboard.press('Escape');
  }
  // A real Holder is explicit fixture topology, independent of telemetry absence.
  await db.collection('topology_nodes').updateOne(
    { id: ENTITY_ID },
    {
      $set: { 'bdfb.shelves.0.frames.0.panels.0.endpoints.4.variant': 'HOLDER' },
      $unset: { 'bdfb.shelves.0.frames.0.panels.0.endpoints.4.telemetryAddress': '' },
    },
  );
  await page.reload();
  await expect(page.locator('.bdfb-endpoint').nth(4)).toContainText('HOLDER');
  await expect(page.locator('.bdfb-endpoint').nth(12)).toContainText('STATE ONLY');
});
