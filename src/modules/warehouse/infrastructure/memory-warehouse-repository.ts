import type { WarehouseRepository } from '@/modules/warehouse/application/warehouse-repository';
import type { AssetTemplate } from '@/modules/warehouse/domain/template';

export class MemoryWarehouseRepository implements WarehouseRepository {
  private readonly templates = new Map<string, AssetTemplate>();

  constructor(seed: readonly AssetTemplate[] = []) {
    for (const template of seed) this.templates.set(template.id, structuredClone(template));
  }

  async getById(id: string): Promise<AssetTemplate | null> {
    const template = this.templates.get(id);
    return template ? structuredClone(template) : null;
  }

  async listActive(): Promise<readonly AssetTemplate[]> {
    return [...this.templates.values()]
      .filter((template) => template.lifecycle === 'ACTIVE')
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((template) => structuredClone(template));
  }

  async insert(template: AssetTemplate): Promise<void> {
    if (this.templates.has(template.id)) throw new Error(`Template already exists: ${template.id}`);
    this.templates.set(template.id, structuredClone(template));
  }
}
