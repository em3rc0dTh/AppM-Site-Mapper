#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { MongoClient } from 'mongodb';

if (process.env.CI_COMBINED_E2E !== 'true' ||
    !process.env.MONGODB_DB_NAME?.startsWith('site_mapper_http_ci_') ||
    !process.env.MONGODB_URI?.includes('127.0.0.1:27017')) {
  throw new Error('Refusing browser acceptance outside ephemeral CI database');
}

const mongo = new MongoClient(process.env.MONGODB_URI);
let browser;
try {
  await mongo.connect();
  const db = mongo.db(process.env.MONGODB_DB_NAME);
  const panel = await db.collection('topology_nodes').findOne({
    kind: 'EQUIPMENT', name: 'CI LIMA Panel 24P',
  });
  const breaker = await db.collection('topology_nodes').findOne({
    kind: 'EQUIPMENT', name: 'CI LIMA Circuit Breaker 01',
  });
  assert.ok(panel?.id && breaker?.id, 'Browser fixtures missing');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const base = process.env.CI_HTTP_BASE_URL || 'http://127.0.0.1:3100';

  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill('mk1-e2e-operator@local.test');
  await page.locator('input[name="password"]').fill('CI-Only-E2E-Strong-2026!');
  await page.getByRole('button', { name: 'SIGN IN' }).click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 30000 });
  console.log('[PASS] Real Chromium: interactive login redirects to authenticated workspace');

  await page.goto(base + '/device/' + panel.id, { waitUntil: 'domcontentloaded' });
  await page.getByText('CI LIMA Panel 24P').first().waitFor({ timeout: 30000 });
  await page.getByText('MQTT POINT COMMISSIONING').waitFor({ timeout: 30000 });
  await page.getByText('0_1_1').first().waitFor({ timeout: 30000 });
  console.log('[PASS] Real Chromium: created panel, commissioning and MQTT point rendered');

  await page.getByText('Point group 0_1').first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: '/tmp/mk1-operational-browser.png', fullPage: true });
  console.log('[PASS] Real Chromium: configured telemetry prefix visible on actual Equipment page');
} catch (error) {
  console.error('[FAIL] Browser operational check:', error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await mongo.close();
}
