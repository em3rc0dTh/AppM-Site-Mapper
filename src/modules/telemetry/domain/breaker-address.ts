import { failure, success, type Result } from '@/shared/domain/result';

export interface BreakerAddress {
  /** Opaque legacy segment. G16 deliberately does not invent its meaning. */
  readonly prefix: number;
  readonly panelIndex: number;
  readonly breakerSlot: number;
}

export type BreakerAddressError = 'INVALID_BREAKER_ADDRESS';

const breakerAddressPattern = /^(\d+)_(\d+)_(\d+)$/;

export function parseBreakerAddress(
  value: string,
): Result<BreakerAddress, BreakerAddressError> {
  const match = breakerAddressPattern.exec(value.trim());

  if (!match) {
    return failure('INVALID_BREAKER_ADDRESS');
  }

  const prefix = Number(match[1]);
  const panelIndex = Number(match[2]);
  const breakerSlot = Number(match[3]);

  if (
    !Number.isInteger(prefix) ||
    !Number.isInteger(panelIndex) ||
    !Number.isInteger(breakerSlot) ||
    prefix < 0 ||
    panelIndex < 1 ||
    breakerSlot < 1 ||
    breakerSlot > 24
  ) {
    return failure('INVALID_BREAKER_ADDRESS');
  }

  return success({ prefix, panelIndex, breakerSlot });
}
