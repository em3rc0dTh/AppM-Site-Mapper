import { describe, expect, it } from 'vitest';

import type { CanonicalNode } from '../../scripts/migrations/legacy/model.ts';
import { validatePromotionCandidate } from '../../scripts/migrations/legacy/promotion-validation.ts';

const timestamp = '2026-09-28T00:00:00.000Z';

function node(
  id: string,
  kind: CanonicalNode['kind'],
  parentId: string | null,
): CanonicalNode {
  return {
    id,
    kind,
    parentId,
    name: id,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('legacy migration promotion validation', () => {
  it('accepts a complete canonical hierarchy', () => {
    const nodes = [
      node('network', 'NETWORK', null),
      node('site', 'SITE', 'network'),
      node('structure', 'STRUCTURE', 'site'),
      node('level', 'LEVEL', 'structure'),
      node('room', 'ROOM_SUBSTRUCTURE', 'level'),
      node('cluster', 'CONTAINER_CLUSTER_BAY', 'room'),
      node('position', 'POSITION', 'cluster'),
      node('rack', 'CONTAINER_RACK', 'position'),
      node('device', 'DEVICE', 'rack'),
      node('equipment', 'EQUIPMENT', 'rack'),
    ];

    expect(validatePromotionCandidate(nodes)).toMatchObject({
      ok: true,
      errors: [],
      countsByKind: {
        NETWORK: 1,
        SITE: 1,
        STRUCTURE: 1,
        LEVEL: 1,
        ROOM_SUBSTRUCTURE: 1,
        CONTAINER_CLUSTER_BAY: 1,
        POSITION: 1,
        CONTAINER_RACK: 1,
        DEVICE: 1,
        EQUIPMENT: 1,
      },
    });
  });

  it('rejects duplicate IDs, orphans and invalid parent kinds', () => {
    const result = validatePromotionCandidate([
      node('network', 'NETWORK', null),
      node('site', 'SITE', 'network'),
      node('site', 'SITE', 'network'),
      node('level', 'LEVEL', 'site'),
      node('device', 'DEVICE', 'missing-rack'),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'DUPLICATE_ID:site',
        'INVALID_PARENT_KIND:level:SITE:STRUCTURE',
        'ORPHAN:device:missing-rack',
      ]),
    );
  });

  it('requires exactly one root network', () => {
    const result = validatePromotionCandidate([
      node('network-a', 'NETWORK', null),
      node('network-b', 'NETWORK', null),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('NETWORK_COUNT:2');
  });
});
