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
  it('materializes deployed legacy positions, CAS and embedded BDFB bindings', () => {
    let cursor = 0;
    const plan = planLegacyMigration(
      {
        network: { id: 'network-id', name: 'Network' },
        collections: {
          Site: [{ id: 'site-1', name: 'Site' }],
          Structure: [{ id: 'structure-1', name: 'Structure', siteId: 'site-1' }],
          Level: [{ id: 'level-1', name: 'Level', structureId: 'structure-1' }],
          Substructure: [{ id: 'room-1', name: 'Room', levelId: 'level-1' }],
          ContainerCluster: [{ id: 'cluster-1', name: 'Cluster-Demo', substructureId: 'room-1' }],
          Container: [
            {
              id: 'rack-1',
              name: 'RACK-EATON-04',
              type: 'CABINET',
              parentId: 'cluster-1',
              parentType: 'cluster',
              grid_coordinate: ['C-6'],
              CAS: [
                {
                  id: 'cas-1',
                  casStatus: 'EQUIPPED',
                  mounting: {
                    startPosition: 1,
                    endPosition: 42,
                    physicalSize: 42,
                    clearance: { top: 1, bottom: 1 },
                  },
                  device: { id: 'bdfb-1' },
                },
              ],
            },
          ],
          Device: [
            {
              id: 'bdfb-1',
              label: 'BDFB-TEST-1',
              category: 'BDFB',
              sn: '25110703400009',
              parentId: 'rack-1',
              shelves: [
                {
                  id: 'shelf-1',
                  label: 'Main Shelf',
                  frames: [
                    {
                      id: 'frame-a',
                      label: 'Frame A',
                      visible: true,
                      panels: [
                        {
                          id: 'panel-a1',
                          label: 'Panel A1',
                          position: 1,
                          breakers: [
                            {
                              id: 'breaker-a1-1',
                              position: 1,
                              label: 'CB-EATON-01',
                              status: 'HOLDER',
                              breaker: null,
                              capacity: 25,
                            },
                            {
                              id: 'holder-a1-2',
                              position: 2,
                              label: 'Holder 2',
                              status: 'HOLDER',
                              breaker: null,
                            },
                          ],
                        },
                        {
                          id: 'panel-a2',
                          label: 'Panel A2',
                          position: 2,
                          breakers: [],
                        },
                      ],
                    },
                    {
                      id: 'frame-b',
                      label: 'Frame B',
                      visible: true,
                      panels: [
                        {
                          id: 'panel-b1',
                          label: 'Panel B1',
                          position: 1,
                          breakers: [
                            {
                              id: 'breaker-b1-1',
                              position: 1,
                              label: 'CB-Breaker-1',
                              status: 'HOLDER',
                              breaker: null,
                              capacity: 30,
                            },
                          ],
                        },
                        {
                          id: 'panel-b2',
                          label: 'Panel B2',
                          position: 2,
                          breakers: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        bfdbPanelTelemetryPrefixes: {
          'bdfb-1': {
            'Panel A1': '0_1_',
            'Panel A2': '0_2_',
            'Panel B1': '0_3_',
            'Panel B2': '0_4_',
          },
        },
      },
      {
        now: '2026-09-28T00:00:00.000Z',
        createId: () => `generated-${++cursor}`,
      },
    );

    expect(plan.rejections).toEqual([]);

    const position = plan.nodes.find((node) => node.kind === 'POSITION');
    const rack = plan.nodes.find((node) => node.legacyId === 'rack-1');
    const device = plan.nodes.find((node) => node.legacyId === 'bdfb-1');

    expect(position).toMatchObject({
      name: 'C-6',
      coordinate: { row: 'C', column: 6 },
    });
    expect(rack).toMatchObject({
      parentId: position?.id,
      kind: 'CONTAINER_RACK',
      variant: 'RACK',
      totalU: 42,
    });

    const cas = (rack?.cas as readonly Record<string, unknown>[]) ?? [];
    expect(cas).toHaveLength(1);
    expect(cas[0]).toMatchObject({
      startU: 1,
      endU: 42,
      state: 'EQUIPPED',
      physicalSizeU: 42,
      clearanceTopU: 1,
      clearanceBottomU: 1,
      occupantId: device?.id,
    });

    const bdfb = device?.bdfb as {
      shelves: Array<{
        frames: Array<{
          label: string;
          panels: Array<{
            label: string;
            endpoints: Array<{
              id: string;
              variant: string;
              label: string;
              telemetry?: { rawPointId: string };
            }>;
          }>;
        }>;
      }>;
    };

    const panels = bdfb.shelves[0]!.frames.flatMap((frame) => frame.panels);
    const a1 = panels.find((panel) => panel.label === 'Panel A1')!;
    const b1 = panels.find((panel) => panel.label === 'Panel B1')!;

    expect(a1.endpoints[0]).toMatchObject({
      id: 'breaker-a1-1',
      variant: 'BREAKER',
      label: 'CB-EATON-01',
      telemetry: { rawPointId: '0_1_1' },
    });
    expect(a1.endpoints[1]).toMatchObject({
      id: 'holder-a1-2',
      variant: 'HOLDER',
      label: 'Holder 2',
    });
    expect(a1.endpoints[1]?.telemetry).toBeUndefined();
    expect(b1.endpoints[0]).toMatchObject({
      variant: 'BREAKER',
      telemetry: { rawPointId: '0_3_1' },
    });

    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceCollection: 'Container',
          legacyId: 'rack-1',
          message: expect.stringContaining('Derived canonical Position C-6'),
        }),
      ]),
    );
  });

  it('preserves an unproven legacy rack as a container instead of inventing U capacity', () => {
    const plan = planLegacyMigration(
      {
        network: { id: 'network-id', name: 'Network' },
        collections: {
          Site: [{ id: 'site-1', name: 'Site' }],
          Structure: [{ id: 'structure-1', name: 'Structure', siteId: 'site-1' }],
          Level: [{ id: 'level-1', name: 'Level', structureId: 'structure-1' }],
          Substructure: [{ id: 'room-1', name: 'Room', levelId: 'level-1' }],
          ContainerCluster: [{ id: 'cluster-1', name: 'Cluster-Demo', substructureId: 'room-1' }],
          Container: [
            {
              id: 'rack-empty',
              name: 'RACK-EATON-02',
              type: 'RACK',
              parentId: 'cluster-1',
              parentType: 'cluster',
              grid_coordinate: ['C-4'],
            },
          ],
        },
      },
      { createId: () => 'generated-id' },
    );

    expect(plan.rejections).toEqual([]);
    expect(plan.nodes.find((node) => node.legacyId === 'rack-empty')).toMatchObject({
      kind: 'CONTAINER_RACK',
      variant: 'CONTAINER',
    });
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          legacyId: 'rack-empty',
          message: expect.stringContaining('without evidence of U capacity'),
        }),
      ]),
    );
  });
});
