import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('MK2 operator-approved connection UI', () => {
  it('keeps POWER_TARGET aliases out of global search results', () => {
    const search = source('src/modules/workspace/application/search-service.ts');
    const palette = source('src/shared/ui/command-palette.tsx');
    expect(search).not.toContain("kind: 'POWER_TARGET'");
    expect(search).toContain("kind: 'POWERED_EQUIPMENT'");
    expect(palette).toContain('setResults(data.results)');
    expect(palette).toContain('<p role="status">');
  });

  it('presents a single full-width electrical summary instead of a legend', () => {
    const diagram = source('src/components/workbench/powered-equipment-connection-diagram.tsx');
    expect(diagram).toContain("t('nominalCurrent')");
    expect(diagram).toContain("t('electricalSummary')");
    expect(diagram).toContain('sm-powered-electrical-summary');
    expect(diagram).not.toContain('sm-powered-legend');
    expect(diagram).not.toContain('sm-powered-feed-totals');
  });

  it('reserves red and green for alarm semantics, not feed identity in Power Trace', () => {
    const css = source('src/app/workbench/power-trace.css');
    expect(css).toContain('--trace-a: #168fe4');
    expect(css).toContain('--trace-b: #d49108');
    expect(css).not.toContain('--trace-a: #ee605d');
    expect(css).not.toContain('--trace-b: #20aa71');
  });
});
