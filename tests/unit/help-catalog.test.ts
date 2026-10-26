import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  getHelpEntry,
  getHelpJourneyForArticle,
  helpBeginnerPath,
  helpCatalog,
  helpJourneys,
  helpScreenshotBySlug,
  helpWorkflowCoverage,
  recommendHelp,
} from '@/modules/help/catalog';
import { getHelpSearchIndex, readHelpArticle } from '@/modules/help/server';

const root = process.cwd();

describe('Customer-facing Site Mapper Help Center', () => {
  it('has 23 unique, safe, bilingual workflow guides', async () => {
    expect(helpCatalog).toHaveLength(23);
    expect(new Set(helpCatalog.map((entry) => entry.slug)).size).toBe(helpCatalog.length);
    expect(new Set(helpCatalog.map((entry) => entry.file)).size).toBe(helpCatalog.length);

    for (const item of helpCatalog) {
      expect(item.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(item.file).toMatch(/^[a-z0-9-]+\.md$/);
      expect(item.title).toBeTruthy();
      expect(item.enTitle).toBeTruthy();
      expect(item.summary).toBeTruthy();
      expect(item.enSummary).toBeTruthy();
      for (const locale of ['es', 'en'] as const) {
        const file = join(root, 'docs', 'help', locale, item.file);
        expect(existsSync(file), file).toBe(true);
        const body = await readHelpArticle(item, locale);
        expect(body.length).toBeGreaterThan(450);
        expect(body).not.toMatch(/(?:\x60{3}|~{3})mermaid|flowchart\s+(?:TD|LR)/i);
        expect(body).not.toMatch(
          /without developer assistance|autoridad técnica|no editar mongo|docker compose|write permission|topology:write|TelemetryBinding/i,
        );
      }
    }

    expect(getHelpEntry('../../.env')).toBeUndefined();
  });

  it('uses friendly localized content for full-text search', async () => {
    const es = await getHelpSearchIndex('es');
    const en = await getHelpSearchIndex('en');
    expect(es).toHaveLength(helpCatalog.length);
    expect(en).toHaveLength(helpCatalog.length);
    expect(es.find((item) => item.slug === 'espacios-y-racks')?.searchText).toContain('dibujar');
    expect(en.find((item) => item.slug === 'espacios-y-racks')?.searchText).toContain('draw');
    expect(es.find((item) => item.slug === 'conexiones')?.searchText).toContain('energia');
    expect(en.find((item) => item.slug === 'conexiones')?.searchText).toContain('power');
    expect(es.find((item) => item.slug === 'manual-maestro')?.searchText).not.toContain(
      'without developer assistance',
    );
  });

  it('renders existing localized illustrations, never Mermaid source', async () => {
    for (const locale of ['es', 'en'] as const) {
      for (const article of helpCatalog) {
        const markdown = await readHelpArticle(article, locale);
        for (const [, uri] of markdown.matchAll(/!\[[^\]]+\]\((\/help\/diagrams\/[^)]+)\)/g)) {
          expect(uri).toMatch(
            /^\/help\/diagrams\/(?:es|en)\/(?:overview|places|rack|power|readings|mqtt|snmp|data-flow)\.svg$/,
          );
          const file = join(root, 'public', uri!.slice(1));
          expect(existsSync(file), file).toBe(true);
          const svg = readFileSync(file, 'utf8');
          expect(svg).toMatch(/<svg\b/);
          expect(svg).toMatch(/<title>/);
          expect(svg).not.toMatch(/<script\b|onload\s*=/i);
        }
        for (const [, uri] of markdown.matchAll(/!\[[^\]]+\]\((\/help\/screenshots\/[^)]+)\)/g)) {
          expect(uri).toMatch(
            /^\/help\/screenshots\/(?:create-site|draw-site-boundary|create-room|edit-room|rack-focus|breaker-live|power-path)\.webp$/,
          );
          const file = join(root, 'public', uri!.slice(1));
          expect(existsSync(file), file).toBe(true);
          const webp = readFileSync(file);
          expect(webp.subarray(0, 4).toString('ascii')).toBe('RIFF');
          expect(webp.subarray(8, 12).toString('ascii')).toBe('WEBP');
        }
      }
    }
    const renderer = readFileSync(
      join(root, 'src/modules/help/components/markdown-article.tsx'),
      'utf8',
    );
    expect(renderer).toContain('help-illustration');
    expect(renderer).toContain('screenshotDimensions');
    expect(renderer).toContain('<Image');
    expect(renderer).not.toContain('dangerouslySetInnerHTML');
    expect(renderer).not.toContain('eval(');
  });

  it('provides a beginner path with real screenshots where they add context', () => {
    const all = new Set(helpCatalog.map((item) => item.slug));
    expect(helpBeginnerPath).toHaveLength(10);
    expect(new Set(helpBeginnerPath).size).toBe(helpBeginnerPath.length);
    expect(helpBeginnerPath[0]).toBe('manual-maestro');
    expect(helpBeginnerPath.at(-1)).toBe('verificacion');
    for (const slug of helpBeginnerPath)
      expect(all.has(slug), `Missing beginner guide ${slug}`).toBe(true);
    for (const [slug, uri] of Object.entries(helpScreenshotBySlug)) {
      expect(all.has(slug), `Screenshot mapped to unknown guide ${slug}`).toBe(true);
      expect(uri).toMatch(/^\/help\/screenshots\/[a-z0-9-]+\.webp$/);
      expect(existsSync(join(root, 'public', uri.slice(1))), uri).toBe(true);
    }
  });

  it('connects task journeys to published articles and approved workflow ids', () => {
    const all = new Set(helpCatalog.map((item) => item.slug));
    expect(helpJourneys).toHaveLength(6);
    for (const journey of helpJourneys) {
      expect(journey.slugs.length).toBeGreaterThanOrEqual(2);
      expect(new Set(journey.slugs).size).toBe(journey.slugs.length);
      for (const slug of journey.slugs) {
        expect(all.has(slug), `Missing journey guide ${slug}`).toBe(true);
        expect(getHelpJourneyForArticle(slug)?.journey).toBeDefined();
      }
    }
    const master = readFileSync(join(root, 'docs/product/help-workflow-master-map-v2.md'), 'utf8');
    for (const entry of helpCatalog) {
      const ids = helpWorkflowCoverage[entry.slug];
      expect(ids?.length, `No workflow references for ${entry.slug}`).toBeGreaterThan(0);
      for (const id of ids ?? []) {
        expect(master.includes(id), `Workflow ${id} not present in master map`).toBe(true);
      }
    }
  });

  it('maps contextual routes only to published guides', () => {
    for (const route of [
      '/workspace',
      '/blueprint/test',
      '/rack/test',
      '/device/test',
      '/power/connect/equipment',
      '/power',
      '/telemetry',
      '/settings',
      '/topology/test',
      '/network',
      '/warehouse',
      '/telemetry/diagnostics',
    ]) {
      const slugs = recommendHelp(route);
      expect(slugs.length).toBeGreaterThan(0);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const slug of slugs) expect(getHelpEntry(slug)).toBeDefined();
    }
  });
});
