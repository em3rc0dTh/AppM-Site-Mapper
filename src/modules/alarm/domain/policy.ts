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
  /** Optional managed rules: legacy voltage/overcurrent/powerLoss remain intact. */
  readonly highVoltage?: {
    readonly assertAboveV: number;
    readonly clearBelowV: number;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly voltageLoss?: {
    readonly zeroToleranceV: number;
    readonly clearAboveV: number;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly lowCurrent?: {
    readonly assertBelowA: number;
    readonly clearAboveA: number;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly loadLoss?: {
    readonly zeroToleranceA: number;
    readonly referenceMinA: number;
    readonly expectedLoad: true;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly suddenCurrentDrop?: {
    readonly referenceCurrentA: number;
    readonly dropPercent: number;
    readonly clearDropPercent: number;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly lowPower?: {
    readonly assertBelowW: number;
    readonly clearAboveW: number;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly highPower?: {
    readonly assertAboveW: number;
    readonly clearBelowW: number;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly noEnergyIncrement?: {
    readonly maxDeltaKwh: number;
    readonly windowMs: number;
    readonly expectedLoad: true;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly energyCounterReset?: {
    readonly minDecrementKwh: number;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly energyConsumptionAnomaly?: {
    readonly minDeltaKwh: number;
    readonly maxDeltaKwh: number;
    readonly windowMs: number;
    readonly debounceSamples: number;
    readonly recoverySamples: number;
    readonly severity?: AlarmSeverity;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}
