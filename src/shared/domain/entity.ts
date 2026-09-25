import { randomUUID } from 'node:crypto';

export type LifecycleState = 'ACTIVE' | 'ARCHIVED';

export interface DomainEntity {
  readonly id: string;
  readonly lifecycle: LifecycleState;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * Monotonic aggregate revision used for optimistic concurrency control.
   * Legacy documents without a revision are interpreted as revision 0.
   */
  readonly revision?: number;
  readonly legacyId?: string;
}

export function createDomainId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
