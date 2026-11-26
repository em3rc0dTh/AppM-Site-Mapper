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
    const workbenchHeader = source('src/components/workbench/workbench-product-header.tsx');
    const productHeader = source('src/shared/ui/site-mapper-product-header.tsx');

    expect(appShell).toContain('<SiteMapperProductHeader');
    expect(workbench).toContain('<WorkbenchProductHeader');

    expect(appShell).not.toContain('<SiteMapperBrand variant="compact"');
    expect(workbench).not.toContain('<SiteMapperBrand variant="compact"');

    expect(workbenchHeader).toContain("pathname.startsWith('/workbench/powered-equipment')");
    expect(workbenchHeader).toContain('<SiteMapperBrand variant="compact" tagline={tagline} />');
    expect(workbenchHeader).toContain(
      '<SiteMapperProductHeader tagline={tagline} ariaLabel={ariaLabel} />',
    );

    expect(productHeader).toContain('<SiteMapperBrand variant="compact" tagline={tagline} />');
    expect(productHeader).not.toContain('className="sm-product-header-link"');
    expect(productHeader).toContain('className="sm-product-header-home"');
    expect(productHeader).toContain('href="/workspace"');
    expect(productHeader).toContain('forwardRef<HTMLDivElement');
    // TFARM04 live contract: only the Home icon navigates; the product identity is visual.
    expect(productHeader).toContain(
      '</Link>\n        <SiteMapperBrand variant="compact" tagline={tagline} />',
    );
  });

  it('locks the approved two-line MK2 product header composition', () => {
    const css = source('src/app/site-mapper-brand.css');

    expect(css).toContain('.sm-product-header .sm-brand--compact .sm-brand-copy');
    expect(css).toContain('display: grid;');
    expect(css).toContain('justify-items: end;');
    expect(css).toContain('background: #18b98f;');
    expect(css).toContain('color: #fff;');
    expect(css).toContain('width: 44px;');
    expect(css).toContain('height: 44px;');
  });

  it('removes Home navigation from powered-equipment and Power Trace independent workbenches', () => {
    const workbenchHeader = source('src/components/workbench/workbench-product-header.tsx');

    expect(workbenchHeader).toContain("pathname.startsWith('/workbench/powered-equipment')");
    expect(workbenchHeader).toContain("pathname.startsWith('/workbench/power-trace')");
    expect(workbenchHeader).toContain('sm-product-header--static');
    expect(workbenchHeader).toContain('<SiteMapperBrand variant="compact" tagline={tagline} />');
    expect(workbenchHeader).not.toContain('href="/workspace"');
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
