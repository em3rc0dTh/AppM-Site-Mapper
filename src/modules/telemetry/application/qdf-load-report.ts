import type { composeQdfHistoricalElectricalContract } from './qdf-electrical-contract';

export const QDF_LOAD_REPORT_VERSION = 'qdf-load-report-v1' as const;

export type QdfHistoricalElectricalContract = ReturnType<
  typeof composeQdfHistoricalElectricalContract
>;

function average(values: readonly number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function minimum(values: readonly number[]): number | null {
  return values.length ? Math.min(...values) : null;
}

function maximum(values: readonly number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function commonBuckets(contract: QdfHistoricalElectricalContract): number {
  const sets = [
    new Set(contract.metrics.voltage.total.map((point) => point.bucketAt)),
    new Set(contract.metrics.current.points.map((point) => point.bucketAt)),
    new Set(contract.metrics.power.points.map((point) => point.bucketAt)),
    new Set(contract.metrics.energy.points.map((point) => point.bucketAt)),
  ];
  if (sets.some((set) => set.size === 0)) return 0;
  return [...sets[0]!].filter((bucket) => sets.slice(1).every((set) => set.has(bucket))).length;
}

function acceptedBounds(contract: QdfHistoricalElectricalContract): {
  firstAcceptedAt: string | null;
  lastAcceptedAt: string | null;
} {
  const observed = [
    ...contract.metrics.voltage.total.map((point) => point.observedAt),
    ...contract.metrics.current.points.map((point) => point.observedAt),
    ...contract.metrics.power.points.map((point) => point.observedAt),
    ...contract.metrics.energy.points.map((point) => point.observedAt),
  ]
    .map((value) => Date.parse(value))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return {
    firstAcceptedAt: observed.length ? new Date(observed[0]!).toISOString() : null,
    lastAcceptedAt: observed.length ? new Date(observed.at(-1)!).toISOString() : null,
  };
}

export function projectQdfLoadReport(contract: QdfHistoricalElectricalContract) {
  const voltage = contract.metrics.voltage.total.map((point) => point.voltageV);
  const current = contract.metrics.current.points.map((point) => point.currentA);
  const power = contract.metrics.power.points.map((point) => point.powerKw);
  const bounds = acceptedBounds(contract);
  return {
    reportVersion: QDF_LOAD_REPORT_VERSION,
    sourceContractVersion: contract.contractVersion,
    deviceId: contract.deviceId,
    window: contract.window,
    status: contract.status,
    ...bounds,
    metrics: {
      voltage: {
        unit: contract.metrics.voltage.unit,
        quality: contract.metrics.voltage.quality,
        average: average(voltage),
        min: minimum(voltage),
        max: maximum(voltage),
      },
      current: {
        unit: contract.metrics.current.unit,
        quality: contract.metrics.current.quality,
        average: average(current),
        peak: maximum(current),
      },
      power: {
        unit: contract.metrics.power.unit,
        quality: contract.metrics.power.quality,
        average: average(power),
        peak: maximum(power),
      },
      energy: {
        unit: contract.metrics.energy.unit,
        quality: contract.metrics.energy.quality,
        total: contract.metrics.energy.totalKwh,
      },
    },
    coverage: {
      voltageBuckets: contract.metrics.voltage.total.length,
      currentBuckets: contract.metrics.current.points.length,
      powerBuckets: contract.metrics.power.points.length,
      energyBuckets: contract.metrics.energy.points.length,
      commonBuckets: commonBuckets(contract),
    },
  };
}
