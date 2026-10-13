import { describe, expect, it } from 'vitest';
import { hydrateTopologyDocument } from '@/modules/topology/infrastructure/topology-document-hydration';

function equipment() {
  return {
    id: 'legacy-cb-1',
    kind: 'EQUIPMENT',
    deviceId: 'device-1',
    parentId: 'device-1',
    parentEquipmentId: null,
    equipmentType: 'CIRCUIT_BREAKER',
    childMode: 'DYNAMIC',
    lifecycle: 'ACTIVE',
    name: 'Legacy Circuit Breaker',
    pinned: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('persisted topology legacy hydration', () => {
  it('reads Equipment predating Access Ports without throwing in power commissioning', () => {
    const node = hydrateTopologyDocument(equipment());
    expect(node.kind).toBe('EQUIPMENT');
    if (node.kind !== 'EQUIPMENT') return;
    expect(node.accessPorts).toEqual([]);
    expect(node.children).toEqual([]);
    expect([...node.accessPorts]).toEqual([]);
  });

  it('preserves existing physical children and access ports on current documents', () => {
    const node = hydrateTopologyDocument({
      ...equipment(),
      children: ['breaker-child', null],
      accessPorts: [{ id: 'power-output', name: 'POWER OUT', portType: 'POWER' }],
    });
    expect(node.kind).toBe('EQUIPMENT');
    if (node.kind !== 'EQUIPMENT') return;
    expect(node.children).toEqual(['breaker-child', null]);
    expect(node.accessPorts).toHaveLength(1);
  });

  it('does not silently erase malformed or corrupted port collections', () => {
    expect(() => hydrateTopologyDocument({ ...equipment(), accessPorts: 'oops' })).toThrow(
      'INVALID_EQUIPMENT_COLLECTIONS',
    );
  });

  it('hydrates older Device records without a root Equipment id list', () => {
    const node = hydrateTopologyDocument({ id: 'old-device', kind: 'DEVICE', name: 'BDFB' });
    expect(node.kind).toBe('DEVICE');
    if (node.kind === 'DEVICE') expect(node.rootEquipmentIds).toEqual([]);
  });
});
