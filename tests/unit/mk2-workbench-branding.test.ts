import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Mk2 shared product header', () => {
  it('uses one reusable product header in AppShell and detached workbenches', () => {
    const appShell = source('src/shared/ui/app-shell.tsx');
    const workbench = source('src/app/workbench/layout.tsx');
    const productHeader = source('src/shared/ui/site-mapper-product-header.tsx');

    expect(appShell).toContain('<SiteMapperProductHeader');
    expect(workbench).toContain('<SiteMapperProductHeader');

    expect(appShell).not.toContain('<SiteMapperBrand variant="compact"');
    expect(workbench).not.toContain('<SiteMapperBrand variant="compact"');

    expect(productHeader).toContain('<SiteMapperBrand variant="compact" tagline={tagline} />');
    expect(productHeader).toContain('className="sm-product-header-home"');
    expect(productHeader).toContain('href="/workspace"');
  });

  it('keeps Power Trace free of the legacy MK1 identity', () => {
    const powerTrace = source('src/components/workbench/full-power-trace-workbench.tsx');
    const es = source('src/messages/es.json');
    const en = source('src/messages/en.json');

    expect(powerTrace).not.toContain('sm-trace-brand');
    expect(powerTrace).not.toContain("t('brand')");
    expect(es).toContain('"brand": "AppManager SiteMapper Mk2"');
    expect(en).toContain('"brand": "AppManager SiteMapper Mk2"');
  });

  it('keeps detached workbenches independent from the full AppShell navigation', () => {
    const shell = source('src/shared/ui/app-shell.tsx');
    expect(shell).toContain("pathname.startsWith('/workbench')");
  });
});
