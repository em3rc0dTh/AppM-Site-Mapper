import type { AssetTemplate } from '@/modules/warehouse/domain/template';

export interface WarehouseRepository {
  getById(id: string): Promise<AssetTemplate | null>;
  listActive(): Promise<readonly AssetTemplate[]>;
  insert(template: AssetTemplate): Promise<void>;
}
