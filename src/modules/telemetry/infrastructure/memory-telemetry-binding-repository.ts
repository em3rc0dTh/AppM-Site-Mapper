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

  async listForTarget(
    targetType: TelemetryBinding['targetType'],
    targetId: string,
  ): Promise<readonly TelemetryBinding[]> {
    return [...this.bindings.values()]
      .filter(
        (binding) =>
          binding.lifecycle === 'ACTIVE' &&
          binding.targetType === targetType &&
          binding.targetId === targetId,
      )
      .map((binding) => structuredClone(binding));
  }

  async listForTargets(
    targetType: TelemetryBinding['targetType'],
    targetIds: readonly string[],
  ): Promise<readonly TelemetryBinding[]> {
    const ids = new Set(targetIds);
    if (ids.size === 0) return [];
    return [...this.bindings.values()]
      .filter(
        (binding) =>
          binding.lifecycle === 'ACTIVE' &&
          binding.targetType === targetType &&
          ids.has(binding.targetId),
      )
      .sort(
        (left, right) =>
          left.targetId.localeCompare(right.targetId) ||
          left.sourceIdentity.localeCompare(right.sourceIdentity) ||
          (left.sourcePointId ?? '').localeCompare(right.sourcePointId ?? ''),
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
