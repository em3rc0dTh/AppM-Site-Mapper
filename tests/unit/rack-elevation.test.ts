import { describe, expect, it } from 'vitest';

import { projectRackElevation } from '@/modules/rack/domain/elevation';
import { initializeCas, reserveCas, equipCas } from '@/modules/rack/domain/cas';

describe('rack elevation projection', () => {
  it('renders U numbers top-down while preserving U1-bottom CAS semantics', () => {
    const initial = initializeCas(10);
    const reserved = reserveCas(initial, 10, {
      mountStartU: 3,
      physicalSizeU: 2,
      clearanceBottomU: 1,
      clearanceTopU: 1,
    });

    if (!reserved.ok || !reserved.allocation) {
      throw new Error('Expected reservation.');
    }

    const equipped = equipCas(reserved.ranges, 10, reserved.allocation.id, 'device-1');

    if (!equipped.ok) {
      throw new Error('Expected equipped allocation.');
    }

    const elevation = projectRackElevation(
      'rack-1',
      'Rack 1',
      10,
      equipped.ranges,
      new Map([
        [
          'device-1',
          {
            id: 'device-1',
            kind: 'DEVICE' as const,
            name: 'Router A',
          },
        ],
      ]),
    );

    expect(elevation.units[0]?.u).toBe(10);
    expect(elevation.units.at(-1)?.u).toBe(1);
    expect(elevation.units.find((unit) => unit.u === 3)).toMatchObject({
      role: 'PHYSICAL',
      state: 'EQUIPPED',
      occupant: { id: 'device-1', kind: 'DEVICE', name: 'Router A' },
    });
    expect(elevation.units.find((unit) => unit.u === 2)?.role).toBe('CLEARANCE');
    expect(elevation.units.find((unit) => unit.u === 5)?.role).toBe('CLEARANCE');
  });
});
