import { describe, expect, it } from 'vitest';
import { BREAKER_FIELD_SCHEDULE, SEED_01_VERSION } from '@/seeds/seed-01';

describe('seed-01 QDF documentary breaker schedule', () => {
  it('advances the additive workbook identity migration to seed v14', () => {
    expect(SEED_01_VERSION).toBe(14);
  });
  it('covers exactly the installed breaker positions in QDF-2/4/5', () => {
    expect(Object.keys(BREAKER_FIELD_SCHEDULE)).toHaveLength(38);
    expect(
      Object.keys(BREAKER_FIELD_SCHEDULE).filter((key) => key.startsWith('QDF-2:')),
    ).toHaveLength(13);
    expect(
      Object.keys(BREAKER_FIELD_SCHEDULE).filter((key) => key.startsWith('QDF-4:')),
    ).toHaveLength(7);
    expect(
      Object.keys(BREAKER_FIELD_SCHEDULE).filter((key) => key.startsWith('QDF-5:')),
    ).toHaveLength(18);
    expect(BREAKER_FIELD_SCHEDULE['QDF-4:7']).toMatchObject({
      ratedCurrentA: 80,
      targetFootprint: '010205.16',
      documentedStatus: 'OFF',
      replacementTargetA: 60,
    });
  });

  it('preserves actual nominal ratings, field footprints and proposed replacements', () => {
    expect(BREAKER_FIELD_SCHEDULE['QDF-2:1']).toMatchObject({
      ratedCurrentA: 100,
      targetFootprint: '010202.10',
      documentedStatus: 'OFF',
    });
    expect(BREAKER_FIELD_SCHEDULE['QDF-2:8']).toMatchObject({
      ratedCurrentA: 80,
      targetFootprint: '010202.11',
      replacementTargetA: 60,
    });
    expect(BREAKER_FIELD_SCHEDULE['QDF-4:6']).toMatchObject({
      ratedCurrentA: 60,
      targetFootprint: '010205.20',
    });
    expect(BREAKER_FIELD_SCHEDULE['QDF-5:8']).toMatchObject({
      ratedCurrentA: 50,
      targetFootprint: '010208.12',
      replacementTargetA: 30,
    });
    expect(BREAKER_FIELD_SCHEDULE['QDF-5:17']).toMatchObject({
      ratedCurrentA: 100,
      targetFootprint: '010208.14',
    });
  });

  it('contains no invented alarm assert/clear thresholds or live electrical status', () => {
    for (const row of Object.values(BREAKER_FIELD_SCHEDULE)) {
      expect(row.ratedCurrentA).toBeGreaterThan(0);
      expect(row).not.toHaveProperty('assertAboveA');
      expect(row).not.toHaveProperty('clearBelowA');
      expect(row).not.toHaveProperty('currentA');
      expect(row.targetFootprint).toMatch(/^\d{6}\.\d{2}$/);
    }
  });
});
