import { describe, expect, it } from 'vitest';

import {
  equipCas,
  freeCas,
  initializeCas,
  reserveCas,
  validateCas,
} from '@/modules/rack/domain/cas';

describe('CAS engine', () => {
  it('reserves, equips and frees a rack interval while preserving full coverage', () => {
    const initial = initializeCas(42);
    const reserved = reserveCas(initial, 42, {
      mountStartU: 10,
      physicalSizeU: 4,
      clearanceBottomU: 1,
      clearanceTopU: 2,
    });

    expect(reserved.ok).toBe(true);

    if (!reserved.ok || !reserved.allocation) {
      throw new Error('Expected reservation.');
    }

    expect(reserved.allocation).toMatchObject({
      startU: 9,
      endU: 15,
      mountStartU: 10,
      physicalSizeU: 4,
      state: 'RESERVED',
    });
    expect(validateCas(reserved.ranges, 42)).toBe(true);

    const equipped = equipCas(reserved.ranges, 42, reserved.allocation.id, 'device-1');

    expect(equipped.ok).toBe(true);

    if (!equipped.ok) {
      throw new Error('Expected equip.');
    }

    expect(equipped.ranges.find((range) => range.id === reserved.allocation?.id)).toMatchObject({
      state: 'EQUIPPED',
      occupantId: 'device-1',
    });

    const freed = freeCas(equipped.ranges, 42, reserved.allocation.id);

    expect(freed.ok).toBe(true);

    if (!freed.ok) {
      throw new Error('Expected free.');
    }

    expect(freed.ranges).toHaveLength(1);
    expect(freed.ranges[0]).toMatchObject({ startU: 1, endU: 42, state: 'AVAILABLE' });
  });

  it('rejects overlap and out-of-capacity reservations', () => {
    const initial = initializeCas(10);
    const first = reserveCas(initial, 10, { mountStartU: 3, physicalSizeU: 3 });

    if (!first.ok) {
      throw new Error('Expected first reservation.');
    }

    expect(reserveCas(first.ranges, 10, { mountStartU: 4, physicalSizeU: 2 })).toEqual({
      ok: false,
      error: 'RANGE_NOT_AVAILABLE',
    });

    expect(reserveCas(first.ranges, 10, { mountStartU: 10, physicalSizeU: 2 })).toEqual({
      ok: false,
      error: 'INVALID_RANGE',
    });
  });
});
