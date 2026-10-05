import type { DomainEntity } from '@/shared/domain/entity';

export type PowerFeed = 'A' | 'B';

export interface PowerPath extends DomainEntity {
  readonly sourceAccessPortId: string;
  readonly targetAccessPortId: string;
  readonly feed?: PowerFeed;
  /** Stable key used to enforce one confirmed physical connection per target POWER input. */
  readonly connectionKey?: string;
  readonly label?: string;
}
