'use client';

import { useMemo } from 'react';

import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';
import { useTelemetryStream } from '@/components/telemetry/use-bdfb-telemetry';
import { aggregateBdfbDescendantTelemetry } from '@/modules/telemetry/application/bdfb-descendant-telemetry';

type Tone = 'healthy' | 'warning' | 'critical' | 'neutral';

export function Front01BdfbHealth({
  deviceId,
  installedEquipmentIds,
}: Readonly<{
  deviceId: string;
  installedEquipmentIds: readonly string[];
}>) {
  const { snapshot, loading: alarmsLoading, error: alarmError } = useAlarmSnapshot();
  const { samples, now, hasSnapshot } = useTelemetryStream();

  const telemetry = useMemo(
    () => aggregateBdfbDescendantTelemetry(samples, installedEquipmentIds, now),
    [samples, installedEquipmentIds, now],
  );

  const rollup = snapshot.rollups[deviceId];
  const activeAlarms = rollup?.activeAlarmCount ?? 0;
  const highestSeverity = rollup?.highestSeverity ?? null;

  const installed = installedEquipmentIds.length;
  const reporting = telemetry.reportingEquipment;

  let tone: Tone = 'healthy';
  let label = 'OPERATIVO';

  if (highestSeverity === 'CRITICAL') {
    tone = 'critical';
    label = 'ALARMA';
  } else if (activeAlarms > 0 || alarmError) {
    tone = 'warning';
    label = activeAlarms > 0 ? 'ATENCIÓN' : 'ESTADO PARCIAL';
  } else if (alarmsLoading || !hasSnapshot) {
    tone = 'neutral';
    label = 'VERIFICANDO';
  } else if (installed === 0) {
    tone = 'neutral';
    label = 'SIN EQUIPO INSTALADO';
  } else if (reporting === 0) {
    tone = 'neutral';
    label = 'SIN TELEMETRÍA';
  } else if (reporting < installed) {
    tone = 'warning';
    label = 'TELEMETRÍA PARCIAL';
  }

  return (
    <span
      className="front01-bdfb-health"
      data-tone={tone}
      title={
        tone === 'critical'
          ? 'Alarma crítica activa'
          : activeAlarms > 0
            ? `${activeAlarms} alarma(s) activa(s)`
            : installedEquipmentIds.length > 0
              ? `${telemetry.reportingEquipment} / ${installedEquipmentIds.length} instalados reportando`
              : 'Sin Equipment instalado'
      }
    >
      <i aria-hidden="true" />
      <b>{label}</b>
    </span>
  );
}
