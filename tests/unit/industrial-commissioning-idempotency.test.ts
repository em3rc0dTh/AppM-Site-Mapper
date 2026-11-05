import { describe, expect, it } from 'vitest';

import { IndustrialCommissioningService } from '@/modules/industrial/application/commissioning-service';
import type { CommunicationProfile } from '@/modules/industrial/domain/commissioning';
import type { CommunicationProfileRepository } from '@/modules/industrial/infrastructure/communication-profile-repository';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import type { TopologyNode } from '@/modules/topology/domain/entities';

class Profiles implements CommunicationProfileRepository {
  constructor(private readonly records: readonly CommunicationProfile[]) {}

  async get(equipmentId: string) {
    return this.records.find((record) => record.equipmentId === equipmentId) ?? null;
  }

  async listByBdfb(bdfbDeviceId: string) {
    return this.records.filter((record) => record.bdfbDeviceId === bdfbDeviceId);
  }

  async listAll() {
    return this.records;
  }

  async save(_next: CommunicationProfile, _expectedRevision: number | null) {
    return false;
  }
}

const evidence = {
  projectId: 's05-test',
  documentName: 'commissioning',
  revision: '1',
};

function profile(
  value: Partial<CommunicationProfile> & Pick<CommunicationProfile, 'equipmentId' | 'role'>,
): CommunicationProfile {
  const { equipmentId, role, ...overrides } = value;
  return {
    equipmentId,
    role,
    bdfbDeviceId: 'qdf',
    recordStatus: 'FIELD_VERIFIED',
    rs485: { baudRate: 9600, dataBits: 8, parity: 'NONE', stopBits: 1 },
    evidence,
    revisionNumber: 1,
    createdAt: '2026-11-05T10:00:00.000Z',
    updatedAt: '2026-11-05T10:00:00.000Z',
    updatedBy: 'tester',
    history: [],
    ...overrides,
  } as CommunicationProfile;
}

function topology(): MemoryTopologyRepository {
  return new MemoryTopologyRepository(
    [
      {
        id: 'qdf',
        name: 'BDFB QDF-TEST',
        kind: 'DEVICE',
        deviceType: 'BDFB',
        lifecycle: 'ACTIVE',
        createdAt: '2026-11-05T10:00:00.000Z',
        updatedAt: '2026-11-05T10:00:00.000Z',
      },
      {
        id: 'gw',
        name: 'QDF-TEST_GW-1',
        kind: 'EQUIPMENT',
        equipmentType: 'NETWORK_BOARD',
        deviceId: 'qdf',
        parentId: 'qdf',
        parentEquipmentId: null,
        childMode: 'DYNAMIC',
        children: [],
        accessPorts: [],
        pinned: false,
        lifecycle: 'ACTIVE',
        createdAt: '2026-11-05T10:00:00.000Z',
        updatedAt: '2026-11-05T10:00:00.000Z',
      },
      {
        id: 'meter',
        name: 'QDF-TEST_METER-A3',
        kind: 'EQUIPMENT',
        equipmentType: 'CUSTOM',
        deviceId: 'qdf',
        parentId: 'qdf',
        parentEquipmentId: null,
        childMode: 'DYNAMIC',
        children: [],
        accessPorts: [],
        pinned: false,
        lifecycle: 'ACTIVE',
        createdAt: '2026-11-05T10:00:00.000Z',
        updatedAt: '2026-11-05T10:00:00.000Z',
      },
      {
        id: 'breaker',
        name: 'A3-01',
        kind: 'EQUIPMENT',
        equipmentType: 'CIRCUIT_BREAKER',
        deviceId: 'qdf',
        parentId: 'qdf',
        parentEquipmentId: null,
        childMode: 'DYNAMIC',
        children: [],
        accessPorts: [],
        pinned: false,
        lifecycle: 'ACTIVE',
        createdAt: '2026-11-05T10:00:00.000Z',
        updatedAt: '2026-11-05T10:00:00.000Z',
      },
    ] as unknown as TopologyNode[],
  );
}

describe('S05 commissioning idempotency', () => {
  it('repeating the exact same Acrel channel confirmation creates no duplicate bindings', async () => {
    const profiles = new Profiles([
      profile({
        equipmentId: 'gw',
        role: 'GATEWAY',
        sourceIdentity: 'GW-SERIAL',
        network: {
          ip: '192.0.2.10',
          mask: '255.255.255.0',
          gateway: '192.0.2.1',
          services: [{ protocol: 'MQTT' }],
        },
      }),
      profile({
        equipmentId: 'meter',
        role: 'METER',
        gatewayEquipmentId: 'gw',
        channelCount: 24,
        rs485: { baudRate: 9600, dataBits: 8, parity: 'NONE', stopBits: 1, slaveId: 1 },
      }),
    ]);
    const bindings = new MemoryTelemetryBindingRepository();
    const service = new IndustrialCommissioningService(topology(), profiles, bindings);
    const input = {
      meterEquipmentId: 'meter',
      breakerId: 'breaker',
      channel: 1,
      rawPointId: '0_1_1',
      metrics: ['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'] as const,
      evidence,
      physicallyVerified: true as const,
    };

    const first = await service.confirmChannel(input, 'operator');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.created).toHaveLength(4);

    const second = await service.confirmChannel(input, 'operator');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.created).toEqual([]);

    const active = await bindings.listForTarget('EQUIPMENT', 'breaker');
    expect(active).toHaveLength(4);
    expect(new Set(active.map((item) => item.metric))).toEqual(
      new Set(['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY']),
    );
  });

  it('fails closed when the same meter channel is presented with a different raw point', async () => {
    const profiles = new Profiles([
      profile({
        equipmentId: 'gw',
        role: 'GATEWAY',
        sourceIdentity: 'GW-SERIAL',
        network: {
          ip: '192.0.2.10',
          mask: '255.255.255.0',
          gateway: '192.0.2.1',
          services: [{ protocol: 'MQTT' }],
        },
      }),
      profile({
        equipmentId: 'meter',
        role: 'METER',
        gatewayEquipmentId: 'gw',
        channelCount: 24,
        rs485: { baudRate: 9600, dataBits: 8, parity: 'NONE', stopBits: 1, slaveId: 1 },
      }),
    ]);
    const bindings = new MemoryTelemetryBindingRepository();
    const service = new IndustrialCommissioningService(topology(), profiles, bindings);
    const base = {
      meterEquipmentId: 'meter',
      breakerId: 'breaker',
      channel: 1,
      metrics: ['CURRENT'] as const,
      evidence,
      physicallyVerified: true as const,
    };

    const first = await service.confirmChannel({ ...base, rawPointId: '0_1_1' }, 'operator');
    expect(first.ok).toBe(true);

    const conflicting = await service.confirmChannel(
      { ...base, rawPointId: '0_1_2' },
      'operator',
    );
    expect(conflicting).toEqual({ ok: false, error: 'CHANNEL_CONFLICT' });
    expect(await bindings.listForTarget('EQUIPMENT', 'breaker')).toHaveLength(1);
  });
});
