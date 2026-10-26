import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { getHelpEntry, helpCatalog, recommendHelp } from '@/modules/help/catalog';
import { getHelpSearchIndex } from '@/modules/help/server';

describe('Site Mapper in-app help manual', () => {
  it('declares unique safe slugs and fixed Markdown files', () => {
    expect(helpCatalog.length).toBeGreaterThanOrEqual(10);
    expect(new Set(helpCatalog.map((entry) => entry.slug)).size).toBe(helpCatalog.length);
    expect(new Set(helpCatalog.map((entry) => entry.file)).size).toBe(helpCatalog.length);
    for (const entry of helpCatalog) {
      expect(entry.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(entry.file).toMatch(/^[a-z0-9-]+\.md$/);
      expect(entry.title).toBeTruthy();
      expect(entry.enTitle).toBeTruthy();
      expect(entry.summary).toBeTruthy();
      expect(entry.enSummary).toBeTruthy();
      expect(existsSync(join(process.cwd(), 'docs/user-guide', entry.file))).toBe(true);
    }
    expect(getHelpEntry('../../.env')).toBeUndefined();
  });

  it('indexes real article text, not just summaries', async () => {
    const indexed = await getHelpSearchIndex();
    expect(indexed).toHaveLength(helpCatalog.length);
    const connections = indexed.find((item) => item.slug === 'conexiones');
    expect(connections?.searchText).toContain('source_already_connected');
    expect(connections?.searchText).toContain('powerpath');
  });

  it('links all contextual destinations to real articles', () => {
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
    ]) {
      const recommendations = recommendHelp(route);
      expect(recommendations.length).toBeGreaterThan(0);
      expect(new Set(recommendations).size).toBe(recommendations.length);
      for (const slug of recommendations) expect(getHelpEntry(slug)).toBeDefined();
    }
  });

  it('does not render untrusted Markdown as raw HTML', () => {
    const renderer = readFileSync(
      join(process.cwd(), 'src/modules/help/components/markdown-article.tsx'),
      'utf8',
    );
    expect(renderer).not.toContain('dangerouslySetInnerHTML');
    expect(renderer).not.toContain('eval(');
  });
});
