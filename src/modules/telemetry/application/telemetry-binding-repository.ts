import type { TopologyNode } from '@/modules/topology/domain/entities';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';

export interface TelemetryBindingRepository {
  commitBindings?(bindings: readonly TelemetryBinding[], expectedTopology: readonly TopologyNode[]): Promise<readonly string[]>;
  listForSource(
    protocol: TelemetryBinding['protocol'],
    sourceIdentity: string,
  ): Promise<readonly TelemetryBinding[]>;
  listForTarget(
    targetType: TelemetryBinding['targetType'],
    targetId: string,
  ): Promise<readonly TelemetryBinding[]>;
  listForTargets(
    targetType: TelemetryBinding['targetType'],
    targetIds: readonly string[],
  ): Promise<readonly TelemetryBinding[]>;
  insert(binding: TelemetryBinding): Promise<void>;
  /** All-or-none commissioned metric bindings. */
  insertBatch?(bindings: readonly TelemetryBinding[]): Promise<void>;
  /** All-or-none retirement; retains original identity and audit evidence. */
  archiveBatch?(bindings: readonly TelemetryBinding[]): Promise<void>;
  replace(binding: TelemetryBinding): Promise<void>;
}
