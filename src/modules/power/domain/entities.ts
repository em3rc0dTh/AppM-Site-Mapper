import type { DomainEntity } from '@/shared/domain/entity';

export type PowerFeed = 'A' | 'B';

export interface InternalPowerEndpoint {
  readonly shelfId?: string;
  readonly frameId?: string;
  readonly panelId?: string;
  readonly breakerHolderId?: string;
}

export interface PowerEndpoint {
  readonly entityId: string;
  readonly internal?: InternalPowerEndpoint;
}

export interface PowerPath extends DomainEntity {
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly source: PowerEndpoint;
  readonly target: PowerEndpoint;
  readonly feed?: PowerFeed;
  readonly label?: string;
}
