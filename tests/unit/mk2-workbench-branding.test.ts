import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Mk2 workbench branding', () => {
  it('uses the canonical AppManager SiteMapper Mk2 brand in detached workbenches', () => {
    const layout = source('src/app/workbench/layout.tsx');
    const powerTrace = source('src/components/workbench/full-power-trace-workbench.tsx');
    const es = source('src/messages/es.json');
    const en = source('src/messages/en.json');

    expect(layout).toContain('<SiteMapperBrand variant="compact" tagline={t(\'tagline\')} />');
    expect(layout).toContain('className="sm-workbench-brand-home"');
    expect(layout).toContain('href="/workspace"');

    expect(powerTrace).not.toContain('sm-trace-brand');
    expect(powerTrace).not.toContain("t('brand')");

    expect(es).toContain('"brand": "AppManager SiteMapper Mk2"');
    expect(en).toContain('"brand": "AppManager SiteMapper Mk2"');
  });

  it('keeps the detached workbench route independent from the full AppShell navigation', () => {
    const shell = source('src/shared/ui/app-shell.tsx');
    expect(shell).toContain("pathname.startsWith('/workbench')");
  });
});
