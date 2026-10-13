import { describe, expect, it } from 'vitest';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import {
  normalizedTelemetryPointPrefix,
  rawPointForPosition,
} from '@/modules/topology/domain/telemetry-point-prefix';

async function fixture() {
  const repository = new MemoryTopologyRepository();
  const service = new TopologyService(repository);
  const network = await service.create({ kind: 'NETWORK', parentId: null, name: 'N' });
  if (!network.ok) throw Error(network.error);
  const site = await service.create({ kind: 'SITE', parentId: network.value.id, name: 'S', polygon: [
    { x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 800 }, { x: 0, y: 800 },
  ] });
  if (!site.ok) throw Error(site.error);
  const structure = await service.create({ kind: 'STRUCTURE', parentId: site.value.id, name: 'Structure', polygon: [
    { x: 0, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 700 }, { x: 0, y: 700 },
  ] });
  if (!structure.ok) throw Error(structure.error);
  const level = await service.create({ kind: 'LEVEL', parentId: structure.value.id, name: 'Level' });
  if (!level.ok) throw Error(level.error);
  const room = await service.create({
    kind: 'ROOM_SUBSTRUCTURE', parentId: level.value.id, name: 'Room', roomVariant: 'ROOM',
    polygon: [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }, { x: 0, y: 600 }],
  });
  if (!room.ok) throw Error(room.error);
  const bay = await service.create({
    kind: 'CONTAINER_CLUSTER_BAY', parentId: room.value.id, name: 'Bay', clusterVariant: 'BAY',
    polygon: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 500 }, { x: 0, y: 500 }],
  });
  if (!bay.ok) throw Error(bay.error);
  const position = await service.create({
    kind: 'POSITION', parentId: bay.value.id, name: 'P', coordinate: { row: 'A', column: 1 },
  });
  if (!position.ok) throw Error(position.error);
  const rack = await service.create({
    kind: 'CONTAINER_RACK', parentId: position.value.id, name: 'R',
    containerVariant: 'RACK', totalU: 42,
  });
  if (!rack.ok) throw Error(rack.error);
  const device = await service.create({ kind: 'DEVICE', parentId: rack.value.id, name: 'BDFB' });
  if (!device.ok) throw Error(device.error);
  return { service, deviceId: device.value.id };
}

describe('Equipment MQTT point prefix commissioning', () => {
  it('persists an operator-entered prefix at creation, then updates it on existing Equipment', async () => {
    const { service, deviceId } = await fixture();
    const panel = await service.create({
      kind: 'EQUIPMENT', parentId: deviceId, name: 'Panel 24P',
      equipmentType: 'PANEL', childMode: 'POSITIONAL', childCapacity: 24,
      telemetryPointPrefix: ' 0_2 ',
    });
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;
    expect(panel.value).toMatchObject({ telemetryPointPrefix: '0_2', children: Array(24).fill(null) });
    const updated = await service.configureEquipment(panel.value.id, { telemetryPointPrefix: '0_3' });
    expect(updated.ok).toBe(true);
    expect(await service.getById(panel.value.id)).toMatchObject({
      telemetryPointPrefix: '0_3', children: Array(24).fill(null),
    });
    const cleared = await service.configureEquipment(panel.value.id, { telemetryPointPrefix: '' });
    expect(cleared.ok).toBe(true);
    expect(await service.getById(panel.value.id)).not.toHaveProperty('telemetryPointPrefix');
  });

  it('accepts configurable capacity, but does not invent a physical breaker mapping', async () => {
    const { service, deviceId } = await fixture();
    const panel = await service.create({
      kind: 'EQUIPMENT', parentId: deviceId, name: '48P',
      equipmentType: 'PANEL', childMode: 'POSITIONAL', childCapacity: 48,
      telemetryPointPrefix: 'bank_A',
    });
    expect(panel.ok).toBe(true);
    expect(rawPointForPosition('bank_A', 48)).toBe('bank_A_48');
    expect(rawPointForPosition('0_2', 1)).toBe('0_2_1');
    expect(rawPointForPosition('0_2', 257)).toBeNull();
    expect(normalizedTelemetryPointPrefix('0_2')).toBe('0_2');
  });

  it('rejects unsafe prefixes and attaching positional group to dynamic Equipment', async () => {
    const { service, deviceId } = await fixture();
    for (const prefix of ['0_2_#', '0/2', '../secrets', 'a '.repeat(50)]) {
      const result = await service.create({
        kind: 'EQUIPMENT', parentId: deviceId, name: 'Invalid',
        childMode: 'POSITIONAL', childCapacity: 24,
        telemetryPointPrefix: prefix,
      });
      expect(result).toEqual({ ok: false, error: 'INVALID_TELEMETRY_POINT_PREFIX' });
    }
    expect(await service.create({
      kind: 'EQUIPMENT', parentId: deviceId, name: 'Not positional',
      telemetryPointPrefix: '0_2',
    })).toEqual({ ok: false, error: 'INVALID_TELEMETRY_POINT_PREFIX' });
  });

  it('will not remove a stored prefix or resize child slots during unrelated changes', async () => {
    const { service, deviceId } = await fixture();
    const created = await service.create({
      kind: 'EQUIPMENT', parentId: deviceId, name: 'Existing',
      equipmentType: 'PANEL', childMode: 'POSITIONAL', childCapacity: 22,
      telemetryPointPrefix: '0_1',
    });
    if (!created.ok) throw Error(created.error);
    expect(await service.configureEquipment(created.value.id, { equipmentType: 'PANEL' })).toMatchObject({
      ok: true,
      value: { telemetryPointPrefix: '0_1', children: Array(22).fill(null) },
    });
    expect(await service.configureEquipment(created.value.id, { childMode: 'DYNAMIC' })).toEqual({
      ok: false, error: 'INVALID_TELEMETRY_POINT_PREFIX',
    });
  });
});
