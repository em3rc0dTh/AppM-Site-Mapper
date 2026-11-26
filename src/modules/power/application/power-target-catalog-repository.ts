import type { PowerTargetCatalogEntry } from '@/modules/power/domain/power-target-catalog';

export interface PowerTargetCatalogRepository {
  listActive(): Promise<readonly PowerTargetCatalogEntry[]>;
  getByIdentityKey(identityKey: string): Promise<PowerTargetCatalogEntry | null>;
  insert(target: PowerTargetCatalogEntry): Promise<void>;
}
