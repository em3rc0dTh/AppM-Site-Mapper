import type { TelemetryHistoryWindow } from '@/modules/telemetry/domain/history';
import type { QdfLiveTotalCurrent, QdfTotalCurrentPoint } from '@/modules/telemetry/application/qdf-total-current';
import type { QdfTotalEnergyPoint } from '@/modules/telemetry/application/qdf-total-energy';
import type { QdfLiveTotalPower, QdfTotalPowerPoint } from '@/modules/telemetry/application/qdf-total-power';
import type {
  QdfHistoricalVoltageProjection,
  QdfVoltageSnapshot,
} from '@/modules/telemetry/application/qdf-total-voltage';

export const QDF_ELECTRICAL_CONTRACT_VERSION = 'qdf-vipe-v1' as const;

export type QdfElectricalMetricQuality = 'VALID' | 'UNAVAILABLE';
export type QdfElectricalContractStatus = 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';

function aggregateStatus(qualities: readonly QdfElectricalMetricQuality[]): QdfElectricalContractStatus {
  const valid = qualities.filter((quality) => quality === 'VALID').length;
  if (valid === qualities.length) return 'COMPLETE';
  if (valid === 0) return 'UNAVAILABLE';
  return 'PARTIAL';
}

export function composeQdfLiveElectricalContract(
  deviceId: string,
  input: Readonly<{
    current: QdfLiveTotalCurrent | null;
    power: QdfLiveTotalPower | null;
    voltage: QdfVoltageSnapshot;
  }>,
) {
  const currentQuality: QdfElectricalMetricQuality = input.current ? 'VALID' : 'UNAVAILABLE';
  const powerQuality: QdfElectricalMetricQuality = input.power ? 'VALID' : 'UNAVAILABLE';
  const voltageQuality: QdfElectricalMetricQuality = input.voltage.total ? 'VALID' : 'UNAVAILABLE';

  return {
    contractVersion: QDF_ELECTRICAL_CONTRACT_VERSION,
    deviceId,
    scope: 'LIVE' as const,
    status: aggregateStatus([voltageQuality, currentQuality, powerQuality]),
    metrics: {
      voltage: {
        unit: 'V' as const,
        semantics: 'COHERENT_REPRESENTATIVE_A_B_BUS_VOLTAGE' as const,
        quality: voltageQuality,
        total: input.voltage.total,
        busA: input.voltage.busA,
        busB: input.voltage.busB,
      },
      current: {
        unit: 'A' as const,
        semantics: 'SUM_VERIFIED_INDEPENDENT_INPUTS' as const,
        quality: currentQuality,
        total: input.current,
      },
      power: {
        unit: 'kW' as const,
        semantics: 'SUM_VERIFIED_PAIRED_VOLTAGE_CURRENT' as const,
        quality: powerQuality,
        total: input.power,
      },
      energy: {
        unit: 'kWh' as const,
        semantics: 'SUM_VERIFIED_FEED_ENERGY_OVER_OBSERVED_INTERVALS' as const,
        quality: 'UNAVAILABLE' as const,
        temporalScope: 'WINDOW_ONLY' as const,
        total: null,
      },
    },
  };
}

export function composeQdfHistoricalElectricalContract(
  deviceId: string,
  window: TelemetryHistoryWindow,
  input: Readonly<{
    current: readonly QdfTotalCurrentPoint[];
    power: readonly QdfTotalPowerPoint[];
    voltage: QdfHistoricalVoltageProjection;
    energy: readonly QdfTotalEnergyPoint[];
    voltageToleranceV: number | null;
  }>,
) {
  const currentQuality: QdfElectricalMetricQuality =
    input.current.length > 0 ? 'VALID' : 'UNAVAILABLE';
  const powerQuality: QdfElectricalMetricQuality =
    input.power.length > 0 ? 'VALID' : 'UNAVAILABLE';
  const voltageQuality: QdfElectricalMetricQuality =
    input.voltage.total.length > 0 ? 'VALID' : 'UNAVAILABLE';
  const energyQuality: QdfElectricalMetricQuality =
    input.energy.length > 0 ? 'VALID' : 'UNAVAILABLE';

  return {
    contractVersion: QDF_ELECTRICAL_CONTRACT_VERSION,
    deviceId,
    scope: 'HISTORY' as const,
    window,
    status: aggregateStatus([voltageQuality, currentQuality, powerQuality, energyQuality]),
    metrics: {
      voltage: {
        unit: 'V' as const,
        semantics: 'COHERENT_REPRESENTATIVE_A_B_BUS_VOLTAGE' as const,
        quality: voltageQuality,
        toleranceV: input.voltageToleranceV,
        busA: input.voltage.busA,
        busB: input.voltage.busB,
        total: input.voltage.total,
      },
      current: {
        unit: 'A' as const,
        semantics: 'SUM_VERIFIED_INDEPENDENT_INPUTS' as const,
        quality: currentQuality,
        points: input.current,
      },
      power: {
        unit: 'kW' as const,
        semantics: 'SUM_VERIFIED_PAIRED_VOLTAGE_CURRENT' as const,
        quality: powerQuality,
        points: input.power,
      },
      energy: {
        unit: 'kWh' as const,
        semantics: 'SUM_VERIFIED_FEED_ENERGY_OVER_OBSERVED_INTERVALS' as const,
        source: 'DERIVED_FROM_PAIRED_VOLTAGE_CURRENT' as const,
        temporalScope: 'WINDOW' as const,
        quality: energyQuality,
        maxIntegratedGapSeconds: 120,
        points: input.energy,
        totalKwh: input.energy.at(-1)?.cumulativeEnergyKwh ?? null,
      },
    },
  };
}
