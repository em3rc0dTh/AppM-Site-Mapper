import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
}

describe('Power Trace declared breaker routing', () => {
  it('routes declared circuit breakers to the target-centric A/B workbench', () => {
    const page = source('src/app/workbench/power-trace/page.tsx');

    expect(page).toContain("entity.equipmentType === 'CIRCUIT_BREAKER'");
    expect(page).toContain('new DeclaredPowerTraceService(topology).resolveBreaker(entity.id)');
    expect(page).toContain('<DeclaredPowerTraceWorkbench');
  });

  it('keeps the powered destination between Feed A and Feed B breakers', () => {
    const view = source('src/components/workbench/declared-power-trace-workbench.tsx');

    const a = view.indexOf('side="A"');
    const target = view.indexOf('sm-trace-declared-destination');
    const b = view.indexOf('side="B"');

    expect(a).toBeGreaterThan(-1);
    expect(target).toBeGreaterThan(a);
    expect(b).toBeGreaterThan(target);
    expect(view).toContain('trace.targetLabel');
    expect(view).toContain('trace.feedA?.targetLabel');
    expect(view).toContain('trace.feedB?.targetLabel');
  });

  it('does not require a physical PowerPath to render the declared breaker pair', () => {
    const service = source('src/modules/power/application/declared-power-trace-service.ts');

    expect(service).toContain('selectedMetadata.companionFeed.breakerId');
    expect(service).toContain("selectedFeed.feed === 'A'");
    expect(service).toContain("selectedFeed.feed === 'B'");
    expect(service).not.toContain("db.collection('power_paths')");
  });
});
