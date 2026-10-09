import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PhysicalEquipmentDiagram } from '@/components/equipment/physical-equipment-diagram';
import {
  projectEquipmentComposition,
  shouldSummarizeFocus,
} from '@/modules/topology/application/equipment-composition-projection';
import type { AccessPort, EquipmentNode } from '@/modules/topology/domain/entities';

const stamp = '2026-10-09T00:00:00.000Z';

function equipment(
  id: string,
  type: EquipmentNode['equipmentType'],
  children: readonly (string | null)[] = [],
  mode: EquipmentNode['childMode'] = 'POSITIONAL',
  ports: readonly AccessPort[] = [],
): EquipmentNode {
  return {
    id,
    kind: 'EQUIPMENT',
    parentId: 'device-1',
    deviceId: 'device-1',
    parentEquipmentId: null,
    equipmentType: type,
    childMode: mode,
    children,
    accessPorts: ports,
    name: id,
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: stamp,
    updatedAt: stamp,
  };
}

describe('contract v1.0 Equipment focused physical composition', () => {
  it('keeps slot ordering and capacity independent of presentation', () => {
    const panel = equipment('panel-1', 'PANEL', ['breaker-1', null, null, 'breaker-2']);
    const mapping = projectEquipmentComposition(panel, new Map());
    expect(mapping.slots.map((slot) => slot.index)).toEqual([0, 1, 2, 3]);
    expect(mapping.occupied).toBe(2);
    expect(mapping.available).toBe(2);
  });

  it('shows BDFB Frame and Panel previews without recursively exploding 24 breakers', () => {
    const chassis = equipment('BDFB Chassis', 'CHASSIS', ['frame-a', 'frame-b']);
    const frameA = equipment('frame-a', 'FRAME', ['panel-a1', null]);
    const panelA = equipment('panel-a1', 'PANEL', Array.from({ length: 24 }, (_, n) => n === 0 ? 'breaker-1' : null));
    const breaker = equipment('breaker-1', 'CIRCUIT_BREAKER', [], 'DYNAMIC');
    const markup = renderToStaticMarkup(
      <PhysicalEquipmentDiagram root={chassis} equipment={[chassis, frameA, panelA, breaker]} />,
    );

    expect(markup).toContain('frame-a');
    expect(markup).toContain('panel-a1');
    expect(markup).toContain('24 positions');
    expect(markup).not.toContain('breaker-1');
    expect(markup).not.toContain('POSITION 24');
  });

  it('renders only recorded Switch terminals, without inventing a 48-port template', () => {
    const ports: AccessPort[] = [
      {
        id: 'ap-01',
        deviceId: 'device-1',
        equipmentId: 'switch-1',
        name: 'ap-01',
        portType: 'DATA',
        direction: 'BIDIRECTIONAL',
        exposure: 'EXTERNAL',
        connectorType: 'RJ45',
        protocol: 'ETHERNET',
        lifecycle: 'ACTIVE',
      },
      {
        id: 'power-input',
        deviceId: 'device-1',
        equipmentId: 'switch-1',
        name: 'Power input',
        portType: 'POWER',
        direction: 'INPUT',
        exposure: 'EXTERNAL',
        lifecycle: 'ACTIVE',
      },
    ];
    const chassis = equipment('switch-1', 'CHASSIS', [], 'DYNAMIC', ports);
    const markup = renderToStaticMarkup(<PhysicalEquipmentDiagram root={chassis} equipment={[chassis]} />);
    expect(markup).toContain('PHYSICAL TERMINALS');
    expect(markup).toContain('ap-01');
    expect(markup).toContain('Power input');
    expect(markup).toContain('2');
    expect(markup.match(/class="equipment-faceplate-port"/g)).toHaveLength(2);
    expect(markup).not.toContain('48 positions');
  });

  it('supports Network Board positions without a BDFB-specific renderer', () => {
    const board = equipment('board-1', 'NETWORK_BOARD', Array(48).fill(null));
    const map = new Map([[board.id, board]]);
    const projection = projectEquipmentComposition(board, map);
    expect(projection.capacity).toBe(48);
    expect(projection.positional).toBe(true);
    expect(shouldSummarizeFocus(projection)).toBe(false);

    const massiveBoard = equipment('board-large', 'NETWORK_BOARD', Array(1000).fill(null));
    expect(shouldSummarizeFocus(projectEquipmentComposition(massiveBoard, new Map()))).toBe(true);
  });
});
