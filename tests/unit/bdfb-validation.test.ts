import { describe, expect, it } from 'vitest';

import { validateBdfb } from '@/modules/power/domain/bdfb-validation';

describe('BDFB validation', () => {
  it('accepts a unique Shelf Frame Panel Breaker hierarchy', () => {
    expect(
      validateBdfb({
        shelves: [
          {
            id: 'shelf-a',
            label: 'Shelf A',
            frames: [
              {
                id: 'frame-a',
                label: 'Frame A',
                panels: [
                  {
                    id: 'panel-a',
                    label: 'Panel A',
                    endpoints: [
                      { id: 'breaker-1', variant: 'BREAKER', label: 'CB-01' },
                      { id: 'holder-1', variant: 'HOLDER', label: 'H-01' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual({ ok: true });
  });

  it('keeps an implicit physical frame valid in the canonical hierarchy', () => {
    expect(
      validateBdfb({
        shelves: [
          {
            id: 'shelf-a',
            label: 'Shelf A',
            frames: [
              {
                id: 'frame-a',
                label: 'Frame A',
                presentation: { physicalFrameVisible: false },
                panels: [
                  {
                    id: 'panel-a',
                    label: 'Panel A',
                    endpoints: [{ id: 'breaker-1', variant: 'BREAKER', label: 'CB-01' }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual({ ok: true });
  });

  it('rejects duplicate identities', () => {
    const result = validateBdfb({
      shelves: [
        {
          id: 'same',
          label: 'Shelf',
          frames: [
            {
              id: 'same',
              label: 'Frame',
              panels: [],
            },
          ],
        },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'DUPLICATE_ID' });
  });
});
