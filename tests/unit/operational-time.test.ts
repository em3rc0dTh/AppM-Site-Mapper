import { describe, expect, it } from 'vitest';

import {
  formatOperationalTimestamp,
  TELXIUS_LURIN_TIME_ZONE,
} from '@/shared/time/operational-time';

describe('operational timestamp presentation', () => {
  it('shows Lima local time while retaining an explicit UTC audit instant', () => {
    const result = formatOperationalTimestamp('2026-11-12T17:35:04.000Z');

    expect(TELXIUS_LURIN_TIME_ZONE).toBe('America/Lima');
    expect(result).toMatchObject({
      display: '12:35:04',
      local: '2026-11-12 12:35:04',
      offset: 'UTC-05:00',
      utc: '2026-11-12T17:35:04.000Z',
    });
    expect(result?.audit).toContain('America/Lima (UTC-05:00)');
    expect(result?.audit).toContain('UTC 2026-11-12T17:35:04.000Z');
  });

  it('fails closed for missing or invalid timestamps', () => {
    expect(formatOperationalTimestamp(undefined)).toBeNull();
    expect(formatOperationalTimestamp('not-a-date')).toBeNull();
  });
});
