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

  it('presents the electrical summary as a compact right-side stack instead of a legend', () => {
    const diagram = source('src/components/workbench/powered-equipment-connection-diagram.tsx');
    expect(diagram).toContain("t('nominalCurrent')");
    expect(diagram).toContain("t('electricalSummary')");
    expect(diagram).toContain('sm-powered-diagram-shell');
    expect(diagram).toContain('sm-powered-electrical-summary');
    expect(diagram).toContain('sm-powered-summary-stack');
    expect(diagram).toContain('sm-powered-diagram-footer');
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

  it('contains the Power Target Catalog inside its commissioning panel', () => {
    const css = source('src/app/telxius-ui.css');

    expect(css).toContain('.power-target-panel {');
    expect(css).toContain('overflow: hidden;');
    expect(css).toContain('.power-target-panel > * {');
    expect(css).toContain('.power-target-catalog {');
    expect(css).toContain('.power-target-table-wrap {');
    expect(css).toContain('overflow-x: auto;');
    expect(css).toContain('max-width: 100%;');
    expect(css).toContain('.power-target-table {');
    expect(css).toContain('min-width: 900px;');
  });

  it('uses the approved wide commissioning layout without an Origin column', () => {
    const component = source('src/components/power/connect-equipment-power-form.tsx');
    const css = source('src/app/telxius-ui.css');

    expect(component).toContain('className="power-port-connect-sidebar"');
    expect(component).toContain('className="power-port-connect-panel power-target-panel"');
    expect(component).not.toContain("<th>{t('origin')}</th>");
    expect(component).not.toContain('power-target-origin');
    expect(component).toContain('colSpan={7}');

    expect(css).toContain('width: min(1680px, 100%);');
    expect(css).toContain('grid-template-columns: minmax(300px, 0.58fr) minmax(0, 1.92fr);');
    expect(css).toContain('.power-port-connect-sidebar {');
    expect(css).toContain('align-items: start;');
    expect(css).toContain('overflow-y: hidden;');
    expect(css).not.toContain('max-height: 310px;');
  });

  it('keeps declared commissioning on-screen after confirmation and opens the diagram separately', () => {
    const component = source('src/components/power/connect-equipment-power-form.tsx');

    expect(component).toContain('setDeclaredSuccess({');
    expect(component).toContain('className="power-port-connect-success"');
    expect(component).toContain('target="_blank"');
    expect(component).toContain('rel="noopener noreferrer"');
    expect(component).toContain('/workbench/powered-equipment?breakerId=');
    expect(component).toContain("t('backToSource', { source: declaredSuccess.sourceName })");
    expect(component).not.toContain(
      'router.push(\n          `/workbench/powered-equipment?breakerId=',
    );
  });

  it('reserves red and green for alarm semantics, not feed identity in Power Trace', () => {
    const css = source('src/app/workbench/power-trace.css');
    expect(css).toContain('--trace-a: #168fe4');
    expect(css).toContain('--trace-b: #d49108');
    expect(css).not.toContain('--trace-a: #ee605d');
    expect(css).not.toContain('--trace-b: #20aa71');
  });
});
