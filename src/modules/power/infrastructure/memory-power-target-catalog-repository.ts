import type { PowerTargetCatalogRepository } from '@/modules/power/application/power-target-catalog-repository';
import type { PowerTargetCatalogEntry } from '@/modules/power/domain/power-target-catalog';

export class MemoryPowerTargetCatalogRepository implements PowerTargetCatalogRepository {
  private readonly targets = new Map<string, PowerTargetCatalogEntry>();

  constructor(seed: readonly PowerTargetCatalogEntry[] = []) {
    for (const target of seed) this.targets.set(target.identityKey, structuredClone(target));
  }

  async listActive(): Promise<readonly PowerTargetCatalogEntry[]> {
    return [...this.targets.values()]
      .filter((target) => target.lifecycle === 'ACTIVE')
      .map((target) => structuredClone(target));
  }

  async getByIdentityKey(identityKey: string): Promise<PowerTargetCatalogEntry | null> {
    const target = this.targets.get(identityKey);
    return target?.lifecycle === 'ACTIVE' ? structuredClone(target) : null;
  }

  async insert(target: PowerTargetCatalogEntry): Promise<void> {
    if (this.targets.has(target.identityKey)) {
      throw Object.assign(new Error('POWER_TARGET_ALREADY_EXISTS'), {
        code: 11000,
        keyPattern: { identityKey: 1 },
      });
    }
    this.targets.set(target.identityKey, structuredClone(target));
  }
}
