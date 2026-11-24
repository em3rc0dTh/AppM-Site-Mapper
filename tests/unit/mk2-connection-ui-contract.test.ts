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

  it('presents the electrical summary as a compact right sidebar beside the diagram', () => {
    const diagram = source('src/components/workbench/powered-equipment-connection-diagram.tsx');
    const css = source('src/app/workbench/powered-equipment.css');
    expect(diagram).toContain("t('nominalCurrent')");
    expect(diagram).toContain("t('electricalSummary')");
    expect(diagram).toContain('sm-powered-diagram-shell');
    expect(diagram).toContain('sm-powered-electrical-summary');
    expect(diagram).toContain('sm-powered-summary-stack');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);');
    expect(css).toContain('position: sticky;');
    expect(diagram).not.toContain('sm-powered-legend');
    expect(diagram).not.toContain('sm-powered-feed-totals');
  });

  it('shows accumulated energy and removes the duplicate declared telemetry block', () => {
    const declared = source('src/components/workbench/declared-power-trace-workbench.tsx');
    const es = JSON.parse(source('src/messages/es.json')) as {
      pages: { power: { summaryEnergy: string } };
    };

    expect(declared).toContain('sm-trace-breaker-live');
    expect(declared).not.toContain('sm-trace-declared-telemetry');
    expect(declared).toContain('sm-trace-updated-at');
    expect(declared).toContain("t('updatedAt'");
    expect(es.pages.power.summaryEnergy).toBe('Energía acumulada (kWh)');
  });

  it('keeps diagram hover and focus readable for every feed', () => {
    const css = source('src/app/workbench/powered-equipment.css');

    // Scoped specificity must beat the global dark button:hover:not(:disabled).
    expect(css).toContain(
      '.sm-powered-equipment-workbench .sm-powered-breaker-row:hover:not(:disabled)',
    );
    expect(css).toContain(
      '.sm-powered-equipment-workbench .sm-powered-endpoint-row:hover:not(:disabled)',
    );
    expect(css).toContain('.sm-powered-equipment-workbench .sm-powered-breaker-row:focus-visible');
    expect(css).toContain('background: var(--feed-hover-background);');
    expect(css).toContain('--feed-hover-background: #f2f8ff;');
    expect(css).toContain('--feed-hover-background: #fff8ea;');
    expect(css).toContain('--feed-hover-text: #183b63;');
    expect(css).toContain('--feed-hover-text: #5e460c;');
    expect(css).toContain('outline: 2px solid #2478e9;');
  });

  it('reserves red and green for alarm semantics, not feed identity in Power Trace', () => {
    const css = source('src/app/workbench/power-trace.css');
    expect(css).toContain('--trace-a: #168fe4');
    expect(css).toContain('--trace-b: #d49108');
    expect(css).not.toContain('--trace-a: #ee605d');
    expect(css).not.toContain('--trace-b: #20aa71');
  });
});