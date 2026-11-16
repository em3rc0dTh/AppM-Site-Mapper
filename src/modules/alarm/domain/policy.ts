import type { AlarmSeverity } from '@/modules/alarm/domain/entities';

export interface AlarmPolicy {
  readonly id: string;
  readonly targetType: 'DEVICE' | 'EQUIPMENT';
  readonly targetId: string;
  readonly sourceContext: string;
  readonly sourceIdentity?: string;
  readonly enabled: boolean;
  readonly telemetryLoss?: {
    readonly lossAfterMs: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly lowVoltage?: {
    readonly assertBelowV: number;
    readonly clearAboveV: number;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly overcurrent?: {
    readonly assertAboveA: number;
    readonly clearBelowA: number;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly powerLoss?: {
    readonly assertVoltageBelowV: number;
    readonly assertCurrentBelowA: number;
    readonly clearVoltageAboveV: number;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}
