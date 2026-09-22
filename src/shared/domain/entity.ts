import { randomUUID } from 'node:crypto';

export type LifecycleState = 'ACTIVE' | 'ARCHIVED';

export interface DomainEntity {
  readonly id: string;
  readonly lifecycle: LifecycleState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly legacyId?: string;
}

export function createDomainId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
