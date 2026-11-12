import type {
  QdfLiveTotalCurrent,
  QdfTotalCurrentPoint,
} from '@/modules/telemetry/application/qdf-total-current';
import type { QdfTotalEnergyPoint } from '@/modules/telemetry/application/qdf-total-energy';
import type {
  QdfLiveTotalPower,
  QdfTotalPowerPoint,
} from '@/modules/telemetry/application/qdf-total-power';
import type {
  QdfHistoricalVoltageProjection,
  QdfVoltageSnapshot,
} from '@/modules/telemetry/application/qdf-total-voltage';
import type { TelemetryHistoryWindow } from '@/modules/telemetry/domain/history';

export const QDF_OPERATIONAL_CONTRACT_VERSION = 'qdf-operational-v1' as const;

export type QdfOperationalMetricQuality = 'VALID' | 'UNAVAILABLE';
export type QdfOperationalContractStatus = 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';

function status(
  qualities: readonly QdfOperationalMetricQuality[],
): QdfOperationalContractStatus {
  const valid = qualities.filter((quality) => quality === 'VALID').length;
  if (valid === qualities.length) return 'COMPLETE';
  if (valid === 0) return 'UNAVAILABLE';
  return 'PARTIAL';
}

export function composeQdfOperationalLiveContract(
  deviceId: string,
  input: Readonly<{
    current: QdfLiveTotalCurrent | null;
    power: QdfLiveTotalPower | null;
    voltage: QdfVoltageSnapshot;
  }>,
) {
  const currentQuality: QdfOperationalMetricQuality = input.current ? 'VALID' : 'UNAVAILABLE';
  const powerQuality: QdfOperationalMetricQuality = input.power ? 'VALID' : 'UNAVAILABLE';
  const voltageQuality: QdfOperationalMetricQuality =
    input.voltage.total ? 'VALID' : 'UNAVAILABLE';

  return {
    contractVersion: QDF_OPERATIONAL_CONTRACT_VERSION,
    deviceId,
    scope: 'LIVE' as const,
    status: status([voltageQuality, currentQuality, powerQuality]),
    metrics: {
      voltage: {
        unit: 'V' as const,
        semantics: 'REPRESENTATIVE_A_B_BUS_VOLTAGE_FROM_OPERATIONAL_INPUTS' as const,
        quality: voltageQuality,
        total: input.voltage.total,
        busA: input.voltage.busA,
        busB: input.voltage.busB,
      },
      current: {
        unit: 'A' as const,
        semantics: 'SUM_OPERATIONAL_INPUTS' as const,
        quality: currentQuality,
        total: input.current,
      },
      power: {
        unit: 'kW' as const,
        semantics: 'SUM_OPERATIONAL_PAIRED_VOLTAGE_CURRENT' as const,
        quality: powerQuality,
        total: input.power,
      },
      energy: {
        unit: 'kWh' as const,
        semantics: 'SUM_OPERATIONAL_FEED_ENERGY_OVER_OBSERVED_INTERVALS' as const,
        quality: 'UNAVAILABLE' as const,
        temporalScope: 'WINDOW_ONLY' as const,
        total: null,
      },
    },
  };
}

export function composeQdfOperationalHistoricalContract(
  deviceId: string,
  window: TelemetryHistoryWindow,
  input: Readonly<{
    current: readonly QdfTotalCurrentPoint[];
    power: readonly QdfTotalPowerPoint[];
    voltage: QdfHistoricalVoltageProjection;
    energy: readonly QdfTotalEnergyPoint[];
  }>,
) {
  const currentQuality: QdfOperationalMetricQuality =
    input.current.length ? 'VALID' : 'UNAVAILABLE';
  const powerQuality: QdfOperationalMetricQuality =
    input.power.length ? 'VALID' : 'UNAVAILABLE';
  const voltageQuality: QdfOperationalMetricQuality =
    input.voltage.total.length ? 'VALID' : 'UNAVAILABLE';
  const energyQuality: QdfOperationalMetricQuality =
    input.energy.length ? 'VALID' : 'UNAVAILABLE';

  return {
    contractVersion: QDF_OPERATIONAL_CONTRACT_VERSION,
    deviceId,
    scope: 'HISTORICAL' as const,
    window,
    status: status([voltageQuality, currentQuality, powerQuality, energyQuality]),
    metrics: {
      voltage: {
        unit: 'V' as const,
        semantics: 'REPRESENTATIVE_A_B_BUS_VOLTAGE_FROM_OPERATIONAL_INPUTS' as const,
        quality: voltageQuality,
        total: input.voltage.total,
        busA: input.voltage.busA,
        busB: input.voltage.busB,
      },
      current: {
        unit: 'A' as const,
        semantics: 'SUM_OPERATIONAL_INPUTS' as const,
        quality: currentQuality,
        points: input.current,
      },
      power: {
        unit: 'kW' as const,
        semantics: 'SUM_OPERATIONAL_PAIRED_VOLTAGE_CURRENT' as const,
        quality: powerQuality,
        points: input.power,
      },
      energy: {
        unit: 'kWh' as const,
        semantics: 'SUM_OPERATIONAL_FEED_ENERGY_OVER_OBSERVED_INTERVALS' as const,
        quality: energyQuality,
        temporalScope: 'WINDOW' as const,
        points: input.energy,
        totalKwh: input.energy.at(-1)?.cumulativeEnergyKwh ?? null,
      },
    },
  };
}
