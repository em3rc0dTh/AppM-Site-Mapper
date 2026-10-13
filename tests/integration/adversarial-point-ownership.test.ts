import { describe, expect, it } from 'vitest';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';

describe('Adversarial telemetry point ownership', () => {
  it('keeps active bindings isolated by target', async () => {
    const repository = new MemoryTelemetryBindingRepository([]);
    const a = await repository.listForTarget('EQUIPMENT', 'breaker-A');
    const b = await repository.listForTarget('EQUIPMENT', 'breaker-B');
    expect(a).toEqual([]);
    expect(b).toEqual([]);
  });
});
