import type { Signal } from '../domain/industrial/observations';

export type ControllerEvidence = Signal & {
  readonly lastObservation?: Pick<Signal, 'eventId' | 'receivedAt' | 'observedAt' | 'quality' | 'rawValue'>;
};

/** A retained interpreted sample cannot stand in for a newer unknown observation. */
export function controllerEvidenceExpiry(signal: ControllerEvidence, now: number): number | null {
  const latest = signal.lastObservation;
  if (latest && (
    latest.eventId !== signal.eventId ||
    latest.observedAt !== signal.observedAt ||
    latest.receivedAt !== signal.receivedAt
  )) return null;
  if (!['VALID', 'UNKNOWN'].includes(signal.quality)) return null;
  const observed = Date.parse(signal.observedAt);
  const received = Date.parse(signal.receivedAt);
  const ttl = signal.staleMs;
  if (![observed, received, ttl, now].every(Number.isFinite) ||
    ttl <= 0 || observed > now + 10000 || received > now + 10000) return null;
  const expires = Math.min(observed, received) + ttl;
  return expires >= now ? expires : null;
}
