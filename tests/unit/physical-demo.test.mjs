import { describe, expect, it } from 'vitest';
import { topologyDocuments, ENTITY_ID } from '../../scripts/fixtures/physical-demo.mjs';
import { validateCas } from '../../src/modules/rack/domain/cas';

describe('physical demo fixture', () => {
  it('mounts the synthetic device without overlap and retains 24 real breakers', () => {
    const nodes = topologyDocuments('2026-09-25T00:00:00Z');
    const rack = nodes.find((node) => node.kind === 'CONTAINER_RACK');
    expect(validateCas(rack.cas, rack.totalU)).toBe(true);
    expect(rack.cas.find((range) => range.state === 'EQUIPPED').occupantId).toBe(ENTITY_ID);
    const device = nodes.find((node) => node.id === ENTITY_ID);
    const endpoints = device.bdfb.shelves[0].frames[0].panels[0].endpoints;
    expect(endpoints).toHaveLength(24);
    expect(endpoints.every((endpoint) => endpoint.variant === 'BREAKER')).toBe(true);
    expect(endpoints.map((endpoint) => endpoint.telemetryAddress)).toEqual(
      Array.from({ length: 24 }, (_, i) => `0_1_${i + 1}`),
    );
  });
});
