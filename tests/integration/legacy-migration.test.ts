import { describe, expect, it } from 'vitest';

import { planLegacyMigration } from '../../scripts/migrations/legacy/transform.ts';

const ids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000008',
  '00000000-0000-4000-8000-000000000009',
];

describe('legacy migration planner', () => {
  it('preserves the accepted hierarchy and Device/Equipment sibling rank', () => {
    let cursor = 0;
    const plan = planLegacyMigration(
      {
        network: {
          id: '00000000-0000-4000-8000-000000000000',
          name: 'Network',
        },
        collections: {
          Site: [{ id: 's1', name: 'Site A' }],
          Structure: [{ id: 'st1', name: 'Structure A', siteId: 's1' }],
          Level: [{ id: 'l1', name: 'L1', structureId: 'st1' }],
          Substructure: [{ id: 'r1', name: 'Room A', levelId: 'l1' }],
          ContainerCluster: [{ id: 'c1', name: 'Bay A', substructureId: 'r1' }],
          Position: [{ id: 'p1', name: 'A-1', clusterId: 'c1', coordinate: 'A-1' }],
          Rack: [{ id: 'rack1', name: 'Rack A', positionId: 'p1', totalU: 42 }],
          Device: [{ id: 'd1', name: 'Device A', rackId: 'rack1' }],
          Equipment: [{ id: 'e1', name: 'Equipment A', rackId: 'rack1' }],
        },
      },
      {
        now: '2026-09-22T00:00:00.000Z',
        createId: () => ids[cursor++]!,
      },
    );

    expect(plan.rejections).toEqual([]);
    const rack = plan.nodes.find((node) => node.legacyId === 'rack1');
    const device = plan.nodes.find((node) => node.legacyId === 'd1');
    const equipment = plan.nodes.find((node) => node.legacyId === 'e1');

    expect(device?.parentId).toBe(rack?.id);
    expect(equipment?.parentId).toBe(rack?.id);
    expect(device?.kind).toBe('DEVICE');
    expect(equipment?.kind).toBe('EQUIPMENT');
  });

  it('rejects unresolved parents instead of inventing hierarchy', () => {
    const plan = planLegacyMigration(
      {
        network: { id: 'network-id', name: 'Network' },
        collections: {
          Device: [{ id: 'd1', name: 'Orphan Device', rackId: 'missing' }],
        },
      },
      { createId: () => 'generated-id' },
    );

    expect(plan.counts.rejected).toBe(1);
    expect(plan.rejections[0]?.reason).toContain('UNRESOLVED_PARENT');
  });

  it('is deterministic when a persisted id map is supplied', () => {
    const input = {
      network: { id: 'network-id', name: 'Network' },
      collections: { Site: [{ id: 's1', name: 'Site A' }] },
      idMap: { 'SITE:s1': 'stable-site-id' },
    } as const;

    const first = planLegacyMigration(input, { now: '2026-09-22T00:00:00.000Z' });
    const second = planLegacyMigration(input, { now: '2026-09-22T00:00:00.000Z' });

    expect(first.nodes).toEqual(second.nodes);
    expect(first.idMap).toEqual(second.idMap);
  });
});
