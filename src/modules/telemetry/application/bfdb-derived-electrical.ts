import type { TelemetryHistoryWriter } from '@/modules/telemetry/application/telemetry-history-writer';
import type {
  BreakerTelemetryReading,
  TelemetryMetricValue,
  TelemetrySample,
} from '@/modules/telemetry/domain/entities';

export const BFDB_DERIVED_POWER_FORMULA = 'DC_V_X_I' as const;
export const BFDB_DERIVED_ENERGY_FORMULA = 'TRAPEZOIDAL_DC_POWER' as const;
export const BFDB_DERIVED_ENERGY_MAX_GAP_MS = 120_000;

interface AccumulatorState {
  readonly energyKwh: number;
  readonly powerW?: number;
  readonly receivedAtMs: number;
  readonly messageId?: string;
}

interface DerivedElectricalPair {
  readonly powerW: TelemetryMetricValue;
  readonly energyKwh: TelemetryMetricValue;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scalar(
  raw: unknown,
  expectedUnit: string,
): { value: number; observedAt?: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.unit !== expectedUnit) return null;
  const value = finite(record.value);
  if (value === null) return null;
  return {
    value,
    ...(typeof record.observedAt === 'string' ? { observedAt: record.observedAt } : {}),
  };
}

function isDerived(raw: unknown, formula: string): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  return record.origin === 'DERIVED' && record.formula === formula;
}

export function deriveDcPowerMetric(
  voltageV: TelemetryMetricValue | undefined,
  currentA: TelemetryMetricValue | undefined,
): TelemetryMetricValue | undefined {
  if (!voltageV || !currentA || voltageV.observedAt !== currentA.observedAt) return undefined;
  const value = voltageV.value * currentA.value;
  if (!Number.isFinite(value)) return undefined;
  return {
    value,
    observedAt: voltageV.observedAt,
    origin: 'DERIVED',
    formula: BFDB_DERIVED_POWER_FORMULA,
    quality: 'ESTIMATED',
  };
}

/**
 * Stateful BFDB DC electrical derivation.
 *
 * - voltage/current are the authoritative field measurements;
 * - source P/EP remain available in the raw MQTT envelope but never govern LIVE;
 * - power is V x I from the same observed frame;
 * - energy is a Site Mapper cumulative integral using real receive intervals only;
 * - gaps larger than maxGapMs are deliberately not interpolated;
 * - when historian state exists, a restart resumes the last derived accumulator.
 */
export class BfdbDerivedElectricalEngine {
  private readonly state = new Map<string, AccumulatorState>();
  private readonly initialized = new Set<string>();

  constructor(
    private readonly history?: TelemetryHistoryWriter,
    private readonly maxGapMs = BFDB_DERIVED_ENERGY_MAX_GAP_MS,
  ) {}

  async applyBreakerReadings(
    readings: readonly BreakerTelemetryReading[],
    messageId?: string,
  ): Promise<readonly BreakerTelemetryReading[]> {
    await this.restore(
      readings.map((reading) => ({
        sourceIdentity: reading.sourceIdentity,
        targetId: reading.breakerId,
      })),
    );

    return readings.map((reading) => {
      const derived = this.derive(
        reading.sourceIdentity,
        reading.breakerId,
        reading.metrics.voltageV,
        reading.metrics.currentA,
        reading.receivedAt,
        messageId,
      );
      if (!derived) {
        const sourceMetrics = {
          ...(reading.metrics.voltageV ? { voltageV: reading.metrics.voltageV } : {}),
          ...(reading.metrics.currentA ? { currentA: reading.metrics.currentA } : {}),
        };
        return { ...reading, metrics: sourceMetrics };
      }
      return {
        ...reading,
        metrics: {
          ...reading.metrics,
          powerW: derived.powerW,
          energyKwh: derived.energyKwh,
        },
      };
    });
  }

  async applyEquipmentSamples(
    samples: readonly TelemetrySample[],
  ): Promise<readonly TelemetrySample[]> {
    await this.restore(
      samples.map((sample) => ({
        sourceIdentity: sample.sourceIdentity,
        targetId: sample.targetId,
      })),
    );

    return samples.map((sample) => {
      const voltage = scalar(sample.reported.voltageV, 'V');
      const current = scalar(sample.reported.currentA, 'A');
      const observedAt =
        voltage?.observedAt ?? current?.observedAt ?? sample.sourceObservedAt ?? sample.receivedAt;
      const voltageMetric =
        voltage && (!current?.observedAt || !voltage.observedAt || voltage.observedAt === observedAt)
          ? { value: voltage.value, observedAt }
          : undefined;
      const currentMetric =
        current && (!voltage?.observedAt || !current.observedAt || current.observedAt === observedAt)
          ? { value: current.value, observedAt }
          : undefined;
      const derived = this.derive(
        sample.sourceIdentity,
        sample.targetId,
        voltageMetric,
        currentMetric,
        sample.receivedAt,
        sample.messageId,
      );

      const reported = { ...sample.reported };
      delete reported.powerW;
      delete reported.energyKwh;
      if (derived) {
        reported.powerW = {
          ...derived.powerW,
          unit: 'W',
        };
        reported.energyKwh = {
          ...derived.energyKwh,
          unit: 'kWh',
          temporalScope: 'SITE_MAPPER_ACCUMULATED',
          maxIntegratedGapSeconds: this.maxGapMs / 1000,
        };
      }
      return { ...sample, reported };
    });
  }

  private derive(
    sourceIdentity: string,
    targetId: string,
    voltageV: TelemetryMetricValue | undefined,
    currentA: TelemetryMetricValue | undefined,
    receivedAt: string,
    messageId?: string,
  ): DerivedElectricalPair | null {
    const powerW = deriveDcPowerMetric(voltageV, currentA);
    if (!powerW) return null;

    const receivedAtMs = Date.parse(receivedAt);
    if (!Number.isFinite(receivedAtMs)) return null;

    const key = this.key(sourceIdentity, targetId);
    const previous = this.state.get(key);
    let energyKwh = previous?.energyKwh ?? 0;
    let integrated = false;

    if (
      previous &&
      receivedAtMs > previous.receivedAtMs &&
      !(messageId && previous.messageId === messageId)
    ) {
      const gapMs = receivedAtMs - previous.receivedAtMs;
      if (gapMs <= this.maxGapMs && previous.powerW !== undefined) {
        const deltaKwh = ((previous.powerW + powerW.value) / 2) * gapMs / 3_600_000_000;
        if (Number.isFinite(deltaKwh)) {
          energyKwh += deltaKwh;
          integrated = true;
        }
      }
      this.state.set(key, {
        energyKwh,
        powerW: powerW.value,
        receivedAtMs,
        ...(messageId ? { messageId } : {}),
      });
    } else if (!previous) {
      this.state.set(key, {
        energyKwh,
        powerW: powerW.value,
        receivedAtMs,
        ...(messageId ? { messageId } : {}),
      });
    }

    return {
      powerW,
      energyKwh: {
        value: energyKwh,
        observedAt: powerW.observedAt,
        origin: 'DERIVED',
        formula: BFDB_DERIVED_ENERGY_FORMULA,
        quality: integrated || previous ? 'ESTIMATED' : 'PARTIAL',
      },
    };
  }

  private async restore(
    targets: readonly { sourceIdentity: string; targetId: string }[],
  ): Promise<void> {
    const missing = targets.filter((target) => {
      const key = this.key(target.sourceIdentity, target.targetId);
      if (this.initialized.has(key)) return false;
      this.initialized.add(key);
      return true;
    });
    if (!missing.length || !this.history?.queryLatestEntities) return;

    try {
      const samples = await this.history.queryLatestEntities(
        [...new Set(missing.map((target) => target.targetId))],
        'EQUIPMENT',
      );
      const allowed = new Set(
        missing.map((target) => this.key(target.sourceIdentity, target.targetId)),
      );
      for (const sample of samples) {
        const key = this.key(sample.sourceIdentity, sample.targetId);
        if (!allowed.has(key)) continue;
        const energy = scalar(sample.reported.energyKwh, 'kWh');
        if (
          !energy ||
          !isDerived(sample.reported.energyKwh, BFDB_DERIVED_ENERGY_FORMULA)
        )
          continue;
        const power = scalar(sample.reported.powerW, 'W');
        const receivedAtMs = Date.parse(sample.receivedAt);
        if (!Number.isFinite(receivedAtMs)) continue;
        this.state.set(key, {
          energyKwh: energy.value,
          ...(power && isDerived(sample.reported.powerW, BFDB_DERIVED_POWER_FORMULA)
            ? { powerW: power.value }
            : {}),
          receivedAtMs,
          ...(sample.messageId ? { messageId: sample.messageId } : {}),
        });
      }
    } catch {
      // LIVE telemetry must remain available when historian recovery is unavailable.
    }
  }

  private key(sourceIdentity: string, targetId: string): string {
    return sourceIdentity + '|' + targetId;
  }
}
