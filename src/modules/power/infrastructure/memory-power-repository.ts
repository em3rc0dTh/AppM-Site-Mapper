import type { PowerRepository } from '@/modules/power/application/power-repository';
import type { PowerPath } from '@/modules/power/domain/entities';

export class MemoryPowerRepository implements PowerRepository {
  private readonly paths = new Map<string, PowerPath>();

  constructor(seed: readonly PowerPath[] = []) {
    for (const path of seed) {
      this.paths.set(path.id, structuredClone(path));
    }
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

  async listForEntity(entityId: string): Promise<readonly PowerPath[]> {
    return [...this.paths.values()]
      .filter(
        (path) =>
          path.lifecycle === 'ACTIVE' &&
          (path.sourceEntityId === entityId || path.targetEntityId === entityId),
      )
      .map((path) => structuredClone(path));
  }

  async insert(path: PowerPath): Promise<void> {
    if (this.paths.has(path.id)) {
      throw new Error(`PowerPath already exists: ${path.id}`);
    }

    this.paths.set(path.id, structuredClone(path));
  }

  async replace(path: PowerPath): Promise<void> {
    if (!this.paths.has(path.id)) {
      throw new Error(`PowerPath does not exist: ${path.id}`);
    }

    this.paths.set(path.id, structuredClone(path));
  }
}
