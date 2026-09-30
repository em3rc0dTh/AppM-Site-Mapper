import type { BreakerHolder } from '@/modules/topology/domain/entities';
import type { BreakerTelemetryReading } from '@/modules/telemetry/domain/entities';

export interface BdfbTelemetryAggregate {
  readonly totalBreakers: number;
  readonly activeBreakers: number;
  readonly emptyHolders: number;
  readonly withoutLiveReading: number;
  readonly averageVoltageV?: number;
  readonly averageCurrentA?: number;
  readonly averagePowerW?: number;
  readonly averageEnergyKwh?: number;
  readonly latestReceivedAt?: string;
}

function average(values: readonly number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function aggregateBdfbTelemetry(
  endpoints: readonly BreakerHolder[],
  readings: readonly BreakerTelemetryReading[],
): BdfbTelemetryAggregate {
  const breakers = endpoints.filter((endpoint) => endpoint.variant === 'BREAKER');
  const emptyHolders = endpoints.filter((endpoint) => endpoint.variant === 'HOLDER').length;
  const eligibleIds = new Set(breakers.map((breaker) => breaker.id));
  const liveReadings = readings.filter((reading) => eligibleIds.has(reading.breakerId));
  const latestReceivedAt = liveReadings
    .map((reading) => reading.receivedAt)
    .sort()
    .at(-1);

  const voltages = liveReadings.flatMap((reading) =>
    reading.metrics.voltageV ? [reading.metrics.voltageV.value] : [],
  );
  const currents = liveReadings.flatMap((reading) =>
    reading.metrics.currentA ? [reading.metrics.currentA.value] : [],
  );
  const powers = liveReadings.flatMap((reading) =>
    reading.metrics.powerW ? [reading.metrics.powerW.value] : [],
  );
  const energies = liveReadings.flatMap((reading) =>
    reading.metrics.energyKwh ? [reading.metrics.energyKwh.value] : [],
  );

  return {
    totalBreakers: breakers.length,
    activeBreakers: liveReadings.length,
    emptyHolders,
    withoutLiveReading: Math.max(0, breakers.length - liveReadings.length),
    ...(average(voltages) === undefined ? {} : { averageVoltageV: average(voltages)! }),
    ...(average(currents) === undefined ? {} : { averageCurrentA: average(currents)! }),
    ...(average(powers) === undefined ? {} : { averagePowerW: average(powers)! }),
    ...(average(energies) === undefined ? {} : { averageEnergyKwh: average(energies)! }),
    ...(latestReceivedAt ? { latestReceivedAt } : {}),
  };
}
