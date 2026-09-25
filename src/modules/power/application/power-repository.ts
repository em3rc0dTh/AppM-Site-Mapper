import type { PowerPath } from '@/modules/power/domain/entities';

export interface PowerRepository {
  getById(id: string): Promise<PowerPath | null>;
  listActive(): Promise<readonly PowerPath[]>;
  listForEntity(entityId: string): Promise<readonly PowerPath[]>;
  insert(path: PowerPath): Promise<void>;
  replace(path: PowerPath, expectedRevision: number): Promise<boolean>;
}
