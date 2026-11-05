import { describe, expect, it, vi } from 'vitest';
import type { Db } from 'mongodb';

import { BreakerLimitService } from '@/modules/power/application/breaker-limit-service';
import type { BreakerProtectionInput } from '@/modules/power/domain/breaker-protection';

// Test the application contract without mutating a live MongoDB or TFARM04.
// Mongo replica-set transaction semantics remain an independent integration gate.
vi.mock('@/shared/infrastructure/mongodb/integrity-transaction', () => ({
  withIntegrityTransaction: async (_db: unknown, work: (session: undefined) => Promise<unknown>) =>
    work(undefined),
}));

const createdAt = '2026-11-05T00:00:00.000Z';
const verified = {
  source: 'MANUFACTURER' as const,
  verified: true,
  reference: 'P/N CB-20A-001',
};
const provisional = { source: 'PROVISIONAL_STANDARD' as const, verified: false };

function settings(
  expectedRevision = 1,
  provenance: BreakerProtectionInput['provenance'] = provisional,
): BreakerProtectionInput {
  return {
    ratedCurrentA: 20,
    assertAboveA: 20,
    clearBelowA: 18,
    provenance,
    expectedRevision,
  };
}

// Local in-memory Mongo driver test double requires dynamic document fields.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecordDocument = Record<string, any>;

function fixture({
  bound = true,
  protectedRating = false,
}: Readonly<{ bound?: boolean; protectedRating?: boolean }> = {}) {
  const nodes: RecordDocument[] = [
    {
      id: 'bdfb', kind: 'DEVICE', deviceType: 'BDFB',
      lifecycle: 'ACTIVE', revision: 1, name: 'QDF-4',
    },
    {
      id: 'panel', kind: 'EQUIPMENT', equipmentType: 'PANEL',
      lifecycle: 'ACTIVE', deviceId: 'bdfb', children: ['breaker-1', 'breaker-2'],
      name: 'A3',
    },
    {
      id: 'breaker-1', kind: 'EQUIPMENT', equipmentType: 'CIRCUIT_BREAKER',
      lifecycle: 'ACTIVE', deviceId: 'bdfb', parentEquipmentId: 'panel',
      name: 'A3-04', revision: 1, updatedAt: createdAt,
      attributes: protectedRating
        ? {
            breakerProtection: {
              ...settings(1, verified),
              updatedAt: createdAt, updatedBy: 'commissioner',
            },
          }
        : {},
    },
    {
      id: 'breaker-2', kind: 'EQUIPMENT', equipmentType: 'CIRCUIT_BREAKER',
      lifecycle: 'ACTIVE', deviceId: 'bdfb', parentEquipmentId: 'panel',
      name: 'A3-05', revision: 1, updatedAt: createdAt, attributes: {},
    },
  ];
  const bindings: RecordDocument[] = bound
    ? [{
        id: 'mqtt-current-1', targetId: 'breaker-1',
        targetType: 'EQUIPMENT', protocol: 'MQTT', metric: 'CURRENT',
        lifecycle: 'ACTIVE', sourceIdentity: 'QDF4-GW', sourcePointId: '0_1_4',
      }]
    : [];
  const policies: RecordDocument[] = [];
  const events: RecordDocument[] = [];
  function matches(record: RecordDocument, query: RecordDocument): boolean {
    return Object.entries(query).every(([key, expected]) => {
      if (typeof expected === 'object' && expected !== null && '$exists' in expected) {
        return (record[key] !== undefined) === Boolean(expected.$exists);
      }
      return record[key] === expected;
    });
  }
  function collection(name: string) {
    const records: RecordDocument[] =
      name === 'topology_nodes' ? nodes :
      name === 'telemetry_bindings' ? bindings :
      name === 'alarm_policies' ? policies :
      name === 'breaker_limit_events' ? events : [];
    return {
      findOne: async (query: RecordDocument) => records.find(row => matches(row, query)) ?? null,
      find: (query: RecordDocument) => {
        let result = records.filter(row => matches(row, query));
        const cursor = {
          toArray: async () => structuredClone(result),
          sort: (_order: RecordDocument) => cursor,
          limit: (n: number) => {
            result = result.slice(0, n);
            return cursor;
          },
        };
        return cursor;
      },
      updateOne: async (query: RecordDocument, update: { $set: RecordDocument }) => {
        const record = records.find(row => matches(row, query));
        if (!record) return { matchedCount: 0 };
        for (const [key, value] of Object.entries(update.$set)) {
          const parts = key.split('.');
          let current = record;
          for (const part of parts.slice(0, -1)) {
            current[part] ??= {};
            current = current[part];
          }
          current[parts.at(-1)!] = value;
        }
        return { matchedCount: 1 };
      },
      insertOne: async (record: RecordDocument) => {
        records.push(structuredClone(record));
        return { acknowledged: true };
      },
    };
  }
  const db = { collection } as unknown as Db;
  return {
    service: new BreakerLimitService(db),
    nodes, policies, events,
  };
}

describe('S01 breaker limit service', () => {
  it('updates only the target breaker and one OVERCURRENT policy, with actor audit', async () => {
    const context = fixture();
    const sibling = structuredClone(context.nodes.find(node => node.id === 'breaker-2'));
    const result = await context.service.update('breaker-1', settings(), 'admin-1');
    expect(result.protection?.ratedCurrentA).toBe(20);
    expect(result.revision).toBe(2);
    expect(result.policy).toMatchObject({ assertAboveA: 20, clearBelowA: 18 });
    expect(context.policies).toHaveLength(1);
    expect(context.nodes.find(node => node.id === 'breaker-2')).toEqual(sibling);
    expect(context.events).toHaveLength(1);
    expect(context.events[0]).toMatchObject({
      breakerId: 'breaker-1',
      actorId: 'admin-1',
      before: null,
      after: { ratedCurrentA: 20 },
    });
    expect(await context.service.history('breaker-1')).toHaveLength(1);
  });

  it('rejects stale changes without writing a policy or audit', async () => {
    const context = fixture();
    await expect(context.service.update('breaker-1', settings(0), 'admin-1'))
      .rejects.toThrow('BREAKER_STALE_WRITE');
    expect(context.policies).toHaveLength(0);
    expect(context.events).toHaveLength(0);
  });

  it('never silently downgrades a verified source to a provisional one', async () => {
    const context = fixture({ protectedRating: true });
    await expect(context.service.update('breaker-1', settings(), 'admin-1'))
      .rejects.toThrow('VERIFIED_RATING_DOWNGRADE_FORBIDDEN');
    expect(context.policies).toHaveLength(0);
    expect(context.events).toHaveLength(0);
  });

  it('refuses policy commissioning if the breaker has no exact current binding', async () => {
    const context = fixture({ bound: false });
    await expect(context.service.update('breaker-1', settings(), 'admin-1'))
      .rejects.toThrow('BREAKER_CURRENT_BINDING_REQUIRED');
    expect(context.events).toHaveLength(0);
  });

  it('rejects an empty breaker slot or missing breaker', async () => {
    const context = fixture();
    await expect(context.service.get('does-not-exist')).rejects.toThrow('BREAKER_NOT_FOUND');
    expect(context.events).toHaveLength(0);
  });
});
