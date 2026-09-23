import { createDomainId } from '@/shared/domain/entity';

import type { CasRange } from '@/modules/topology/domain/entities';

export type CasError =
  | 'INVALID_CAPACITY'
  | 'INVALID_RANGE'
  | 'RANGE_NOT_AVAILABLE'
  | 'RESERVATION_NOT_FOUND'
  | 'ALLOCATION_NOT_FOUND'
  | 'INVALID_OCCUPANT';

export interface ReserveCasInput {
  readonly mountStartU: number;
  readonly physicalSizeU: number;
  readonly clearanceTopU?: number;
  readonly clearanceBottomU?: number;
}

export interface CasResult {
  readonly ok: true;
  readonly ranges: readonly CasRange[];
  readonly allocation?: CasRange;
}

export interface CasFailure {
  readonly ok: false;
  readonly error: CasError;
}

export function initializeCas(totalU: number): readonly CasRange[] {
  if (!Number.isInteger(totalU) || totalU < 1) {
    throw new Error('Rack capacity must be a positive integer.');
  }

  return [
    {
      id: createDomainId(),
      startU: 1,
      endU: totalU,
      state: 'AVAILABLE',
    },
  ];
}

export function validateCas(ranges: readonly CasRange[], totalU: number): boolean {
  if (!Number.isInteger(totalU) || totalU < 1 || ranges.length === 0) {
    return false;
  }

  const sorted = [...ranges].sort((left, right) => left.startU - right.startU);

  if (sorted[0]?.startU !== 1 || sorted.at(-1)?.endU !== totalU) {
    return false;
  }

  for (let index = 0; index < sorted.length; index += 1) {
    const range = sorted[index];

    if (!range || range.startU < 1 || range.endU < range.startU || range.endU > totalU) {
      return false;
    }

    const next = sorted[index + 1];

    if (next && next.startU !== range.endU + 1) {
      return false;
    }

    if (range.state === 'AVAILABLE') {
      if (
        range.occupantId ||
        range.mountStartU !== undefined ||
        range.physicalSizeU !== undefined
      ) {
        return false;
      }
      continue;
    }

    if (
      range.mountStartU === undefined ||
      range.physicalSizeU === undefined ||
      !Number.isInteger(range.mountStartU) ||
      !Number.isInteger(range.physicalSizeU) ||
      range.physicalSizeU < 1
    ) {
      return false;
    }

    const physicalEnd = range.mountStartU + range.physicalSizeU - 1;

    if (range.mountStartU < range.startU || physicalEnd > range.endU) {
      return false;
    }

    if (range.state === 'EQUIPPED' && !range.occupantId) {
      return false;
    }

    if (range.state === 'RESERVED' && range.occupantId) {
      return false;
    }
  }

  return true;
}

export function reserveCas(
  ranges: readonly CasRange[],
  totalU: number,
  input: ReserveCasInput,
): CasResult | CasFailure {
  if (!validateCas(ranges, totalU)) {
    return { ok: false, error: 'INVALID_CAPACITY' };
  }

  const top = input.clearanceTopU ?? 0;
  const bottom = input.clearanceBottomU ?? 0;

  if (
    !Number.isInteger(input.mountStartU) ||
    !Number.isInteger(input.physicalSizeU) ||
    !Number.isInteger(top) ||
    !Number.isInteger(bottom) ||
    input.mountStartU < 1 ||
    input.physicalSizeU < 1 ||
    top < 0 ||
    bottom < 0
  ) {
    return { ok: false, error: 'INVALID_RANGE' };
  }

  const physicalEnd = input.mountStartU + input.physicalSizeU - 1;
  const allocationStart = input.mountStartU - bottom;
  const allocationEnd = physicalEnd + top;

  if (allocationStart < 1 || allocationEnd > totalU) {
    return { ok: false, error: 'INVALID_RANGE' };
  }

  const available = ranges.find(
    (range) =>
      range.state === 'AVAILABLE' && range.startU <= allocationStart && range.endU >= allocationEnd,
  );

  if (!available) {
    return { ok: false, error: 'RANGE_NOT_AVAILABLE' };
  }

  const allocation: CasRange = {
    id: createDomainId(),
    startU: allocationStart,
    endU: allocationEnd,
    state: 'RESERVED',
    mountStartU: input.mountStartU,
    physicalSizeU: input.physicalSizeU,
    ...(top > 0 ? { clearanceTopU: top } : {}),
    ...(bottom > 0 ? { clearanceBottomU: bottom } : {}),
  };

  const replacement: CasRange[] = [];

  if (available.startU < allocationStart) {
    replacement.push({
      id: available.id,
      startU: available.startU,
      endU: allocationStart - 1,
      state: 'AVAILABLE',
    });
  }

  replacement.push(allocation);

  if (allocationEnd < available.endU) {
    replacement.push({
      id: createDomainId(),
      startU: allocationEnd + 1,
      endU: available.endU,
      state: 'AVAILABLE',
    });
  }

  const next = ranges
    .filter((range) => range.id !== available.id)
    .concat(replacement)
    .sort((left, right) => left.startU - right.startU);

  return { ok: true, ranges: next, allocation };
}

export function equipCas(
  ranges: readonly CasRange[],
  totalU: number,
  allocationId: string,
  occupantId: string,
): CasResult | CasFailure {
  if (!occupantId.trim()) {
    return { ok: false, error: 'INVALID_OCCUPANT' };
  }

  const target = ranges.find((range) => range.id === allocationId);

  if (!target || target.state !== 'RESERVED') {
    return { ok: false, error: 'RESERVATION_NOT_FOUND' };
  }

  const next = ranges.map((range) =>
    range.id === allocationId
      ? {
          ...range,
          state: 'EQUIPPED' as const,
          occupantId,
        }
      : range,
  );

  if (!validateCas(next, totalU)) {
    return { ok: false, error: 'INVALID_RANGE' };
  }

  const equipped = next.find((range) => range.id === allocationId);

  if (!equipped) {
    return { ok: false, error: 'RESERVATION_NOT_FOUND' };
  }

  return { ok: true, ranges: next, allocation: equipped };
}

function mergeAvailable(ranges: readonly CasRange[]): readonly CasRange[] {
  const sorted = [...ranges].sort((left, right) => left.startU - right.startU);
  const merged: CasRange[] = [];

  for (const range of sorted) {
    const previous = merged.at(-1);

    if (
      previous?.state === 'AVAILABLE' &&
      range.state === 'AVAILABLE' &&
      previous.endU + 1 === range.startU
    ) {
      merged[merged.length - 1] = {
        id: previous.id,
        startU: previous.startU,
        endU: range.endU,
        state: 'AVAILABLE',
      };
      continue;
    }

    merged.push(range);
  }

  return merged;
}

export function freeCas(
  ranges: readonly CasRange[],
  totalU: number,
  allocationId: string,
): CasResult | CasFailure {
  const target = ranges.find((range) => range.id === allocationId);

  if (!target || target.state === 'AVAILABLE') {
    return { ok: false, error: 'ALLOCATION_NOT_FOUND' };
  }

  const available: CasRange = {
    id: target.id,
    startU: target.startU,
    endU: target.endU,
    state: 'AVAILABLE',
  };

  const next = mergeAvailable(
    ranges.map((range) => (range.id === allocationId ? available : range)),
  );

  if (!validateCas(next, totalU)) {
    return { ok: false, error: 'INVALID_RANGE' };
  }

  return { ok: true, ranges: next };
}
