import type { DomainEntity } from '@/shared/domain/entity';

export type PowerFeed = 'A' | 'B';

export interface PowerPath extends DomainEntity {
  readonly sourceAccessPortId: string;
  readonly targetAccessPortId: string;
  readonly feed?: PowerFeed;
  readonly label?: string;
}
