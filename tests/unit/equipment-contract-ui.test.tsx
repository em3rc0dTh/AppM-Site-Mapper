import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EquipmentContractViews } from '@/components/equipment/equipment-contract-views';
import { projectCompositionTelemetry } from '@/modules/telemetry/application/composition-telemetry-summary';
import { projectCompositionHistory } from '@/modules/telemetry/application/composition-history';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { CompositionBreakerTelemetry } from '@/modules/telemetry/domain/composition-breaker-telemetry';
import type { EquipmentNode } from '@/modules/topology/domain/entities';

const stamp = '2026-10-22T00:00:00.000Z';

function makeNode(
  id: string,
  equipmentType: EquipmentNode['equipmentType'],
  children: readonly (string | null)[] = [],
): EquipmentNode {
  return {
    id,
    kind: 'EQUIPMENT',
    name: id,
    deviceId: 'device-1',
    parentId: 'device-1',
    parentEquipmentId: null,
    equipmentType,
    childMode: 'POSITIONAL',
    children,
    accessPorts: [],
    lifecycle: 'ACTIVE',
    pinned: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

describe('Equipment Composition SCREEN 12', () => {
  const breakerA = makeNode('Breaker A', 'CIRCUIT_BREAKER');
  const breakerB = makeNode('Breaker B', 'CIRCUIT_BREAKER');
  const breakerC = makeNode('Breaker C', 'CIRCUIT_BREAKER');
  const panelA = makeNode('Panel A', 'PANEL', [breakerA.id, breakerB.id, null, null, breakerC.id]);
  const panelB = makeNode('Panel B', 'PANEL', Array(24).fill(null));
  const frame = makeNode('Frame 1', 'FRAME', [panelA.id, panelB.id]);
  const shelf = makeNode('Shelf 1', 'SHELF', [frame.id]);
  const chassis = makeNode('Chassis 1', 'CHASSIS', [shelf.id]);
  const nodes = [breakerA, breakerB, breakerC, panelA, panelB, frame, shelf, chassis];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const readings: Readonly<Record<string, CompositionBreakerTelemetry>> = {
    [breakerA.id]: { status: 'LIVE', voltageV: 12, currentA: 10, powerW: 120, energyKwh: 4 },
    [breakerB.id]: { status: 'LIVE', voltageV: 14, powerW: 70, energyKwh: 6 },
    [breakerC.id]: { status: 'STALE', voltageV: 13, currentA: 11, powerW: 143 },
  };

  it('never includes empty slots, stale breakers or missing metrics in a mean', () => {
    const summary = projectCompositionTelemetry(chassis, byId, readings);
    expect(summary.installed).toBe(3);
    expect(summary.bound).toBe(3);
    expect(summary.reporting).toBe(2);
    expect(summary.stale).toBe(1);
    expect(summary.metrics.voltageV).toBe(13);
    expect(summary.metrics.currentA).toBe(10);
    expect(summary.metrics.powerW).toBe(95);
    expect(summary.metrics.energyKwh).toBe(5);
    expect(summary.metricCounts.currentA).toBe(1);
  });

  it('has matching descendant metrics at chassis, shelf and frame with only one branch', () => {
    const fromChassis = projectCompositionTelemetry(chassis, byId, readings);
    const fromShelf = projectCompositionTelemetry(shelf, byId, readings);
    const fromFrame = projectCompositionTelemetry(frame, byId, readings);
    expect(fromChassis.metrics).toEqual(fromShelf.metrics);
    expect(fromShelf.metrics).toEqual(fromFrame.metrics);
  });

  it('renders frames side-by-side and panel links in vertical frame stacks', () => {
    const markup = renderToStaticMarkup(
      <EquipmentContractViews root={shelf} equipmentById={byId} readings={readings} />,
    );
    expect(markup).toContain('ec-frames-grid');
    expect(markup).toContain('ec-frame-panels');
    expect(markup).toContain('Panel A');
    expect(markup).toContain('Panel B');
    expect(markup).not.toContain('Breaker A');
  });

  it('renders all 24 physical slots at once, occupied and empty, without a toggle', () => {
    const panel = makeNode('Panel 24', 'PANEL', [
      breakerA.id,
      breakerB.id,
      breakerC.id,
      ...Array(21).fill(null),
    ]);
    const markup = renderToStaticMarkup(
      <EquipmentContractViews root={panel} equipmentById={byId} readings={readings} />,
    );
    expect(markup).toContain('Breaker A');
    expect(markup).toContain('Breaker B');
    expect(markup).toContain('21 available');
    expect(markup).toContain('24 total');
    expect(markup).toContain('ec-empty-breaker-row');
    expect(markup.match(/class="ec-empty-breaker-row"/g)).toHaveLength(21);
    expect(markup).not.toContain('VIEW SLOTS');
    expect(markup).toContain('STALE');
    expect(markup).toContain('12.00');
  });

  it('provides the selected breaker own readings without combining descendants', () => {
    const markup = renderToStaticMarkup(
      <EquipmentContractViews root={breakerA} equipmentById={byId} readings={readings} />,
    );
    expect(markup).toContain('MQTT source');
    expect(markup).toContain('120.00');
    expect(markup).toContain('LIVE');
    expect(markup).not.toContain('Breaker B');
  });

  it('does not show empty telemetry cards or reporting badges without LIVE readings', () => {
    const unmapped: Readonly<Record<string, CompositionBreakerTelemetry>> = {
      [breakerA.id]: { status: 'NO DATA' },
    };
    const markup = renderToStaticMarkup(
      <EquipmentContractViews root={breakerA} equipmentById={byId} readings={unmapped} />,
    );
    expect(markup).toContain('Circuit details');
    expect(markup).toContain('No active readings');
    expect(markup).not.toContain('ec-breaker-metrics');
    expect(markup).not.toContain('breakers reporting');
  });


  it('averages panel means equally at frame level, never all leaves as a flat average', () => {
    const first = makeNode('Panel X', 'PANEL', [breakerA.id, breakerB.id]);
    const second = makeNode('Panel Y', 'PANEL', [breakerC.id]);
    const parent = makeNode('Frame X', 'FRAME', [first.id, second.id]);
    const group = new Map([first, second, parent, breakerA, breakerB, breakerC].map((n) => [n.id, n]));
    const live = {
      [breakerA.id]: { status: 'LIVE', voltageV: 10 },
      [breakerB.id]: { status: 'LIVE', voltageV: 20 },
      [breakerC.id]: { status: 'LIVE', voltageV: 90 },
    } as const;
    const result = projectCompositionTelemetry(parent, group, live);
    expect(result.metrics.voltageV).toBe(52.5);
    expect(result.reportingChildren).toBe(2);
    expect(result.installedChildren).toBe(2);
    expect(result.reporting).toBe(3);
    expect(result.metricCounts.voltageV).toBe(3);
    const partial = projectCompositionTelemetry(parent, group, {
      [breakerA.id]: { status: 'LIVE', voltageV: 10 },
      [breakerB.id]: { status: 'STALE', voltageV: 20 },
      [breakerC.id]: { status: 'NO DATA' },
    });
    expect(partial.reportingChildren).toBe(1);
    expect(partial.installedChildren).toBe(2);
    expect(partial.metrics.voltageV).toBe(10);
  });

  it('does not count an online-only state as a measured breaker', () => {
    const result = projectCompositionTelemetry(panelA, byId, {
      [breakerA.id]: { status: 'LIVE', state: 'ONLINE' },
    });
    expect(result.reporting).toBe(0);
    expect(result.reportingChildren).toBe(0);
  });

  it('plots only bound historical MQTT electrical samples, retaining zero values', () => {
    const point = makeNode('Historical Panel', 'PANEL', [breakerA.id, null]);
    const nodes = new Map([point, breakerA].map((node) => [node.id, node]));
    const sample = (at: string, value: number): TelemetrySample => ({
      bindingId: 'binding-v',
      metricBindingIds: ['binding-v'],
      sourcePointId: '0_1_1',
      targetId: breakerA.id,
      targetType: 'EQUIPMENT',
      entityId: breakerA.id,
      entityKind: 'EQUIPMENT',
      sourceIdentity: 'EMU-BFDB-01',
      protocol: 'BFDB',
      receivedAt: at,
      reported: { voltageV: { value, unit: 'V', observedAt: at } },
    });
    const result = projectCompositionHistory(
      point,
      nodes,
      new Map([[breakerA.id, [
        sample('2026-10-22T12:00:10.000Z', 0),
        sample('2026-10-22T12:00:30.000Z', 12),
        sample('2026-10-22T12:05:30.000Z', 15),
      ]]]),
      [{ id: 'binding-v', targetId: breakerA.id, sourceIdentity: 'EMU-BFDB-01', sourcePointId: '0_1_1', metric: 'VOLTAGE' }],
      300_000,
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.metrics.voltageV).toBe(12);
    expect(result[1]?.metrics.voltageV).toBe(15);
    expect(result[0]?.reporting).toBe(1);
    expect(result[0]?.positions).toBe(2);
    const unmapped = projectCompositionHistory(
      point, nodes,
      new Map([[breakerA.id, [sample('2026-10-22T12:00:10.000Z', 0)]]]),
      [],
      300_000,
    );
    expect(unmapped).toHaveLength(0);
  });

  it('does not use duplicate descendants when canonical references contain a cycle', () => {
    const loop = { ...frame, children: [panelA.id, panelA.id, frame.id] };
    expect(
      projectCompositionTelemetry(loop, new Map([...byId, [loop.id, loop]]), readings).installed,
    ).toBe(3);
  });
});
