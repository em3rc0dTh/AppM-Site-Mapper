/** S01 — canonical breaker protection settings, not SNMP shunt capacity. */
export type BreakerRatingSource =
  'PROVISIONAL_STANDARD' | 'FIELD_SURVEY' | 'MANUFACTURER' | 'CUSTOMER_DOCUMENT';

export interface BreakerProtection {
  readonly ratedCurrentA: number;
  readonly assertAboveA: number;
  readonly clearBelowA: number;
  readonly provenance: {
    readonly source: BreakerRatingSource;
    readonly verified: boolean;
    readonly reference?: string;
  };
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface BreakerProtectionInput {
  readonly ratedCurrentA: number;
  readonly assertAboveA: number;
  readonly clearBelowA: number;
  readonly provenance: BreakerProtection['provenance'];
  readonly expectedRevision: number;
  readonly verificationConfirmed?: boolean;
}

const SOURCES: readonly BreakerRatingSource[] = [
  'PROVISIONAL_STANDARD',
  'FIELD_SURVEY',
  'MANUFACTURER',
  'CUSTOMER_DOCUMENT',
];

export function parseBreakerProtectionInput(value: unknown): BreakerProtectionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_BREAKER_LIMITS');
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) =>
        ![
          'ratedCurrentA',
          'assertAboveA',
          'clearBelowA',
          'provenance',
          'expectedRevision',
          'verificationConfirmed',
        ].includes(key),
    )
  ) {
    throw new Error('INVALID_BREAKER_LIMITS');
  }
  const positive = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100_000;
  if (
    !positive(body.ratedCurrentA) ||
    !positive(body.assertAboveA) ||
    !positive(body.clearBelowA)
  ) {
    throw new Error('INVALID_BREAKER_LIMITS');
  }
  if ((body.clearBelowA as number) >= (body.assertAboveA as number))
    throw new Error('INVALID_BREAKER_HYSTERESIS');
  if (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 0) {
    throw new Error('INVALID_BREAKER_REVISION');
  }
  if (!body.provenance || typeof body.provenance !== 'object' || Array.isArray(body.provenance)) {
    throw new Error('INVALID_BREAKER_PROVENANCE');
  }
  const p = body.provenance as Record<string, unknown>;
  if (Object.keys(p).some((key) => !['source', 'verified', 'reference'].includes(key)))
    throw new Error('INVALID_BREAKER_PROVENANCE');
  if (!SOURCES.includes(p.source as BreakerRatingSource) || typeof p.verified !== 'boolean') {
    throw new Error('INVALID_BREAKER_PROVENANCE');
  }
  if (p.reference !== undefined && (typeof p.reference !== 'string' || p.reference.length > 320)) {
    throw new Error('INVALID_BREAKER_PROVENANCE');
  }
  if (p.source === 'PROVISIONAL_STANDARD' && p.verified)
    throw new Error('PROVISIONAL_RATING_CANNOT_BE_VERIFIED');
  if (
    p.source !== 'PROVISIONAL_STANDARD' &&
    (!p.verified || !p.reference || typeof p.reference !== 'string' || !p.reference.trim())
  ) {
    throw new Error('VERIFIED_RATING_REQUIRES_EVIDENCE');
  }
  if (p.source !== 'PROVISIONAL_STANDARD' && body.verificationConfirmed !== true) {
    throw new Error('VERIFIED_RATING_REQUIRES_CONFIRMATION');
  }
  if (body.verificationConfirmed !== undefined && typeof body.verificationConfirmed !== 'boolean') {
    throw new Error('INVALID_BREAKER_CONFIRMATION');
  }
  return {
    ratedCurrentA: body.ratedCurrentA as number,
    assertAboveA: body.assertAboveA as number,
    clearBelowA: body.clearBelowA as number,
    expectedRevision: body.expectedRevision as number,
    ...(body.verificationConfirmed === true ? { verificationConfirmed: true } : {}),
    provenance: {
      source: p.source as BreakerRatingSource,
      verified: p.verified as boolean,
      ...(typeof p.reference === 'string' && p.reference.trim()
        ? { reference: p.reference.trim() }
        : {}),
    },
  };
}

export function readBreakerProtection(
  attributes: Readonly<Record<string, unknown>> | undefined,
): BreakerProtection | null {
  const value = attributes?.breakerProtection;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  try {
    const parsed = parseBreakerProtectionInput({
      ratedCurrentA: v.ratedCurrentA,
      assertAboveA: v.assertAboveA,
      clearBelowA: v.clearBelowA,
      provenance: v.provenance,
      expectedRevision: 0,
      verificationConfirmed: true, // Reading stored evidence is not an operator mutation.
    });
    return {
      ratedCurrentA: parsed.ratedCurrentA,
      assertAboveA: parsed.assertAboveA,
      clearBelowA: parsed.clearBelowA,
      provenance: parsed.provenance,
      updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : '',
      updatedBy: typeof v.updatedBy === 'string' ? v.updatedBy : '',
    };
  } catch {
    return null;
  }
}
