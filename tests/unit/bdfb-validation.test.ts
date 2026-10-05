import { describe, expect, it } from 'vitest';

import { validateBdfb } from '@/modules/power/domain/bdfb-validation';

describe('BDFB validation', () => {
  it('accepts a unique Shelf Frame Panel Breaker hierarchy with empty positions', () => {
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
                    positions: [
                      {
                        id: 'breaker-1',
                        label: 'CB-01',
                        telemetry: { rawPointId: '0_1_1' },
                      },
                      null,
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

  it('keeps a presentation-flattened physical frame valid', () => {
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
                physicalFrameVisible: false,
                panels: [
                  {
                    id: 'panel-a',
                    label: 'Panel A',
                    positions: [{ id: 'breaker-1', label: 'CB-01' }],
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
          frames: [{ id: 'same', label: 'Frame', panels: [] }],
        },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'DUPLICATE_ID' });
  });

  it('rejects duplicate explicit MQTT point bindings', () => {
    const result = validateBdfb({
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
                  positions: [
                    {
                      id: 'breaker-1',
                      label: 'CB-01',
                      telemetry: { rawPointId: '0_1_1' },
                    },
                    {
                      id: 'breaker-2',
                      label: 'CB-02',
                      telemetry: { rawPointId: '0_1_1' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'DUPLICATE_TELEMETRY_POINT' });
  });
});
