import { describe, expect, it } from 'vitest';

import { backfillConfig2InputRatings, CONFIG2_INPUT_RATED_CURRENT_A } from '@/seeds/seed-01';
import type { AccessPort } from '@/modules/topology/domain/entities';

function port(id: string, feed: 'A' | 'B', ratedCurrentA?: number): AccessPort {
  return {
    id,
    deviceId: 'device-1',
    equipmentId: 'chassis-1',
    name: `SNMP INPUT ${feed}`,
    portType: 'POWER',
    direction: 'INPUT',
    exposure: 'EXTERNAL',
    protocol: 'SNMPv2c',
    lifecycle: 'ACTIVE',
    attributes: {
      snmpFeedInput: true,
      feed,
      sourceIdentity: 'FIELD-SOURCE',
      currentOid: `1.3.6.1.4.1.test.${feed}`,
      commissioning: 'FIELD',
      ...(ratedCurrentA === undefined ? {} : { ratedCurrentA }),
    },
  };
}

describe('seed-01 Config2 rating backfill', () => {
  it('fills missing A/B nominal ratings without changing field commissioning metadata', () => {
    const a = port('feed-a', 'A');
    const b = port('feed-b', 'B');

    const result = backfillConfig2InputRatings([a, b]);

    expect(result.changed).toBe(true);
    expect(result.accessPorts).toHaveLength(2);
    expect(result.accessPorts[0]?.attributes).toMatchObject({
      feed: 'A',
      ratedCurrentA: CONFIG2_INPUT_RATED_CURRENT_A,
      sourceIdentity: 'FIELD-SOURCE',
      currentOid: '1.3.6.1.4.1.test.A',
      commissioning: 'FIELD',
    });
    expect(result.accessPorts[1]?.attributes).toMatchObject({
      feed: 'B',
      ratedCurrentA: CONFIG2_INPUT_RATED_CURRENT_A,
      sourceIdentity: 'FIELD-SOURCE',
      currentOid: '1.3.6.1.4.1.test.B',
      commissioning: 'FIELD',
    });
  });

  it('preserves an existing field rating instead of overwriting it', () => {
    const result = backfillConfig2InputRatings([
      port('feed-a', 'A', 1200),
      port('feed-b', 'B', 800),
    ]);

    expect(result.changed).toBe(false);
    expect(result.accessPorts[0]?.attributes?.ratedCurrentA).toBe(1200);
    expect(result.accessPorts[1]?.attributes?.ratedCurrentA).toBe(800);
  });

  it('does not modify unrelated or archived ports', () => {
    const unrelated: AccessPort = {
      ...port('network', 'A'),
      portType: 'NETWORK',
      attributes: { feed: 'A', snmpFeedInput: false },
    };
    const archived: AccessPort = {
      ...port('archived', 'B'),
      lifecycle: 'ARCHIVED',
    };

    const result = backfillConfig2InputRatings([unrelated, archived]);

    expect(result.changed).toBe(false);
    expect(result.accessPorts).toEqual([unrelated, archived]);
  });
});
