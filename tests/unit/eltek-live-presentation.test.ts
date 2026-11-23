import { describe, expect, it } from 'vitest';
import {
  presentEltekReading,
  ELTEK_MAX_AGE_MS,
  type EltekSignal,
} from '@/modules/telemetry/application/eltek-live-presentation';

const now = Date.parse('2026-11-23T18:00:00.000Z');
const signal = (rawValue: unknown, receivedAt = new Date(now).toISOString()): EltekSignal => ({
  key: '1.3.6.1.4.1.12148.10.2.1.0',
  rawValue,
  value: null,
  quality: 'VALID',
  receivedAt,
});

describe('SmartPack2 raw presentation', () => {
  it('shows current normal enum without misinterpreting null', () => {
    expect(presentEltekReading(signal(1), now, 'system').text).toBe('Normal (1)');
    expect(presentEltekReading(signal(null), now, 'system').state).toBe('INVALID');
    expect(presentEltekReading(undefined, now, 'system').state).toBe('UNAVAILABLE');
  });
  it('checks freshness of each OID separately', () => {
    const old = signal(273, new Date(now - ELTEK_MAX_AGE_MS - 1).toISOString());
    expect(presentEltekReading(old, now, 'current').state).toBe('STALE');
    expect(presentEltekReading(signal(5374), now, 'battery').state).toBe('RECENT');
  });
  it('rejects invalid and future timestamps', () => {
    expect(presentEltekReading(signal(1, 'bad'), now, 'system').state).toBe('INVALID');
    expect(
      presentEltekReading(signal(1, new Date(now + 100_000).toISOString()), now, 'system').state,
    ).toBe('INVALID');
  });
  it('preserves raw numbers without fabricating A or V units', () => {
    expect(presentEltekReading(signal(273), now, 'current').text).toBe('273');
    expect(presentEltekReading(signal(5374), now, 'battery').text).toBe('5374');
  });
});
