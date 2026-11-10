'use client';

import { useMemo } from 'react';

import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';
import { useTelemetryStream } from '@/components/telemetry/use-bdfb-telemetry';
import { aggregateBdfbDescendantTelemetry } from '@/modules/telemetry/application/bdfb-descendant-telemetry';

type Tone = 'healthy' | 'warning' | 'critical';

export function Front01BdfbHealth({
  deviceId,
  descendantEquipmentIds,
}: Readonly<{
  deviceId: string;
  descendantEquipmentIds: readonly string[];
}>) {
  const { snapshot, loading: alarmsLoading, error: alarmError } = useAlarmSnapshot();
  const { samples, now, hasSnapshot } = useTelemetryStream();

  const telemetry = useMemo(
    () => aggregateBdfbDescendantTelemetry(samples, descendantEquipmentIds, now),
    [samples, descendantEquipmentIds, now],
  );

  const rollup = snapshot.rollups[deviceId];
  const activeAlarms = rollup?.activeAlarmCount ?? 0;
  const highestSeverity = rollup?.highestSeverity ?? null;

  let tone: Tone = 'healthy';
  let label = 'OPERATIVO';

  if (highestSeverity === 'CRITICAL') {
    tone = 'critical';
    label = 'ALARMA';
  } else if (activeAlarms > 0) {
    tone = 'warning';
    label = 'ATENCIÓN';
  } else if (alarmError || alarmsLoading || !hasSnapshot || telemetry.reportingEquipment === 0) {
    tone = 'warning';
    label = hasSnapshot ? 'SIN DATOS RECIENTES' : 'VERIFICANDO';
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
            : telemetry.reportingEquipment > 0
              ? `${telemetry.reportingEquipment} Equipment reportando`
              : 'Sin telemetría reciente'
      }
    >
      <i aria-hidden="true" />
      <b>{label}</b>
    </span>
  );
}
