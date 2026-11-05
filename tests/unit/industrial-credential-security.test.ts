import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IndustrialCredentialService } from '@/modules/industrial/application/credential-service';
import type {
  IndustrialCredentialEvent,
  IndustrialCredentialRecord,
} from '@/modules/industrial/domain/credential';
import type { IndustrialCredentialRepository } from '@/modules/industrial/infrastructure/credential-repository';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import type { TopologyNode } from '@/modules/topology/domain/entities';

class CaptureCredentialRepository implements IndustrialCredentialRepository {
  record: IndustrialCredentialRecord | null = null;
  events: IndustrialCredentialEvent[] = [];

  async get(equipmentId: string) {
    return this.record?.equipmentId === equipmentId ? structuredClone(this.record) : null;
  }

  async saveWithEvent(
    next: IndustrialCredentialRecord,
    expectedRevision: number | null,
    event: IndustrialCredentialEvent,
  ) {
    if ((this.record?.revisionNumber ?? null) !== expectedRevision) return false;
    this.record = structuredClone(next);
    this.events.push(structuredClone(event));
    return true;
  }

  async appendEvent(event: IndustrialCredentialEvent) {
    this.events.push(structuredClone(event));
  }

  async removeWithEvent(
    equipmentId: string,
    expectedRevision: number,
    event: IndustrialCredentialEvent,
  ) {
    if (
      this.record?.equipmentId !== equipmentId ||
      this.record.revisionNumber !== expectedRevision
    )
      return false;
    this.record = null;
    this.events.push(structuredClone(event));
    return true;
  }

  async listEvents(equipmentId: string, limit = 20) {
    return this.events
      .filter((event) => event.equipmentId === equipmentId)
      .slice(-limit)
      .reverse()
      .map((event) => structuredClone(event));
  }
}

function topology() {
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
        id: 'gateway',
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
    ] as unknown as TopologyNode[],
  );
}

describe('S05 industrial credential security', () => {
  const previous = process.env.SITE_MAPPER_CREDENTIAL_KEY;

  beforeEach(() => {
    process.env.SITE_MAPPER_CREDENTIAL_KEY = '11'.repeat(32);
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.SITE_MAPPER_CREDENTIAL_KEY;
    else process.env.SITE_MAPPER_CREDENTIAL_KEY = previous;
  });

  it('stores only AES-GCM ciphertext and returns secret-free metadata', async () => {
    const repository = new CaptureCredentialRepository();
    const service = new IndustrialCredentialService(repository, topology());
    const plaintext = 'field-password-do-not-leak';

    const result = await service.setPassword('gateway', plaintext, 'admin');
    expect(result.ok).toBe(true);
    expect(repository.record).not.toBeNull();
    expect(repository.record).toMatchObject({
      equipmentId: 'gateway',
      algorithm: 'AES-256-GCM',
      keyVersion: 1,
      revisionNumber: 1,
    });
    expect(repository.record?.ciphertext).not.toContain(plaintext);
    expect(JSON.stringify(repository.record)).not.toContain(plaintext);
    expect(JSON.stringify(result)).not.toContain(plaintext);
    expect(repository.events.map((event) => event.type)).toEqual(['CREATED']);
  });

  it('reveals only through the explicit service path and audits the reveal', async () => {
    const repository = new CaptureCredentialRepository();
    const service = new IndustrialCredentialService(repository, topology());
    const plaintext = 'rotate-me-after-field-import';

    expect((await service.setPassword('gateway', plaintext, 'admin')).ok).toBe(true);
    const revealed = await service.revealPassword('gateway', 'operator');

    expect(revealed).toMatchObject({
      ok: true,
      value: {
        password: plaintext,
      },
    });
    expect(repository.events.map((event) => event.type)).toEqual(['CREATED', 'REVEALED']);
    if (revealed.ok) {
      expect(JSON.stringify(revealed.value.metadata)).not.toContain(plaintext);
      expect(revealed.value.metadata.lastRevealedBy).toBe('operator');
    }
  });

  it('fails closed when the runtime encryption key is absent', async () => {
    delete process.env.SITE_MAPPER_CREDENTIAL_KEY;
    const repository = new CaptureCredentialRepository();
    const service = new IndustrialCredentialService(repository, topology());

    await expect(service.setPassword('gateway', 'secret', 'admin')).resolves.toEqual({
      ok: false,
      error: 'CREDENTIAL_KEY_NOT_CONFIGURED',
    });
    expect(repository.record).toBeNull();
    expect(repository.events).toEqual([]);
  });
});
