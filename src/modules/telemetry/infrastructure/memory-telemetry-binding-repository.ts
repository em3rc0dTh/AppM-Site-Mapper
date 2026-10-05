import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';

export class MemoryTelemetryBindingRepository implements TelemetryBindingRepository {
  private readonly bindings = new Map<string, TelemetryBinding>();

  constructor(seed: readonly TelemetryBinding[] = []) {
    for (const binding of seed) this.bindings.set(binding.id, structuredClone(binding));
  }

  async listForSource(
    protocol: TelemetryBinding['protocol'],
    sourceIdentity: string,
  ): Promise<readonly TelemetryBinding[]> {
    return [...this.bindings.values()]
      .filter(
        (binding) =>
          binding.lifecycle === 'ACTIVE' &&
          binding.protocol === protocol &&
          binding.sourceIdentity === sourceIdentity,
      )
      .map((binding) => structuredClone(binding));
  }

  async insert(binding: TelemetryBinding): Promise<void> {
    if (this.bindings.has(binding.id))
      throw new Error('TelemetryBinding already exists: ' + binding.id);
    this.bindings.set(binding.id, structuredClone(binding));
  }

  async replace(binding: TelemetryBinding): Promise<void> {
    if (!this.bindings.has(binding.id))
      throw new Error('TelemetryBinding does not exist: ' + binding.id);
    this.bindings.set(binding.id, structuredClone(binding));
  }
}
