import { describe, expect, it } from 'vitest';

import { resolveRackFootprint } from '@/modules/spatial/domain/rack-footprint';

const room = [
  { x: 0, y: 0 },
  { x: 2400, y: 0 },
  { x: 2400, y: 1800 },
  { x: 0, y: 1800 },
] as const;

describe('run-aware rack footprint', () => {
  it('lets depth exceed one tile while width consumes consecutive horizontal slots', () => {
    const result = resolveRackFootprint(
      { row: 'A', column: 1 },
      {
        start: { row: 'A', column: 1 },
        end: { row: 'A', column: 4 },
        orientation: 'HORIZONTAL',
      },
      { width: 900, depth: 1200 },
      room,
    );

    expect(result).toEqual({
      ok: true,
      rect: { x: 0, y: 0, width: 900, depth: 1200 },
      coveredCoordinates: [
        { row: 'A', column: 1 },
        { row: 'A', column: 2 },
      ],
    });
  });

  it('rejects width when there are not enough slots left in the run', () => {
    const result = resolveRackFootprint(
      { row: 'A', column: 4 },
      {
        start: { row: 'A', column: 1 },
        end: { row: 'A', column: 4 },
        orientation: 'HORIZONTAL',
      },
      { width: 900, depth: 600 },
      room,
    );

    expect(result).toEqual({ ok: false, error: 'RACK_WIDTH_EXCEEDS_CLUSTER_RUN' });
  });

  it('rotates the footprint with a vertical cluster run', () => {
    const result = resolveRackFootprint(
      { row: 'A', column: 1 },
      {
        start: { row: 'A', column: 1 },
        end: { row: 'D', column: 1 },
        orientation: 'VERTICAL',
      },
      { width: 900, depth: 1200 },
      room,
    );

    expect(result).toEqual({
      ok: true,
      rect: { x: 0, y: 0, width: 1200, depth: 900 },
      coveredCoordinates: [
        { row: 'A', column: 1 },
        { row: 'B', column: 1 },
      ],
    });
  });

  it('respects a reverse run direction when consuming width', () => {
    const result = resolveRackFootprint(
      { row: 'A', column: 4 },
      {
        start: { row: 'A', column: 4 },
        end: { row: 'A', column: 1 },
        orientation: 'HORIZONTAL',
      },
      { width: 900, depth: 600 },
      room,
    );

    expect(result).toEqual({
      ok: true,
      rect: { x: 1500, y: 0, width: 900, depth: 600 },
      coveredCoordinates: [
        { row: 'A', column: 4 },
        { row: 'A', column: 3 },
      ],
    });
  });
});
