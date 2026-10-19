import type { PowerRepository } from '@/modules/power/application/power-repository';
import type { PowerPath } from '@/modules/power/domain/entities';

export class MemoryPowerRepository implements PowerRepository {
  private readonly paths = new Map<string, PowerPath>();

  constructor(seed: readonly PowerPath[] = []) {
    for (const path of seed) this.paths.set(path.id, structuredClone(path));
  }

  async getById(id: string): Promise<PowerPath | null> {
    const path = this.paths.get(id);
    return path ? structuredClone(path) : null;
  }

  async listActive(): Promise<readonly PowerPath[]> {
    return [...this.paths.values()]
      .filter((path) => path.lifecycle === 'ACTIVE')
      .map((path) => structuredClone(path));
  }

  async listForAccessPort(accessPortId: string): Promise<readonly PowerPath[]> {
    return [...this.paths.values()]
      .filter(
        (path) =>
          path.lifecycle === 'ACTIVE' &&
          (path.sourceAccessPortId === accessPortId || path.targetAccessPortId === accessPortId),
      )
      .map((path) => structuredClone(path));
  }

  async insert(path: PowerPath): Promise<void> {
    if (this.paths.has(path.id)) throw new Error('PowerPath already exists: ' + path.id);
    if (path.lifecycle === 'ACTIVE') {
      for (const existing of this.paths.values()) {
        if (existing.lifecycle !== 'ACTIVE') continue;
        if (existing.targetAccessPortId === path.targetAccessPortId) {
          throw Object.assign(new Error('TARGET_ALREADY_CONNECTED'), {
            code: 11000,
            keyPattern: { targetAccessPortId: 1 },
          });
        }
        if (existing.sourceAccessPortId === path.sourceAccessPortId) {
          throw Object.assign(new Error('SOURCE_ALREADY_CONNECTED'), {
            code: 11000,
            keyPattern: { sourceAccessPortId: 1 },
          });
        }
      }
    }
    this.paths.set(path.id, structuredClone(path));
  }

  async replace(path: PowerPath): Promise<void> {
    if (!this.paths.has(path.id)) throw new Error('PowerPath does not exist: ' + path.id);
    this.paths.set(path.id, structuredClone(path));
  }
}
