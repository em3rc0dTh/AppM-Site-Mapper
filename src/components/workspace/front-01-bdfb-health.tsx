'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('front01Ui');
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
  let label = t('statusOperational');

  if (highestSeverity === 'CRITICAL') {
    tone = 'critical';
    label = t('statusAlarm');
  } else if (activeAlarms > 0 || alarmError) {
    tone = 'warning';
    label = activeAlarms > 0 ? t('statusAttention') : t('statusPartial');
  } else if (alarmsLoading || !hasSnapshot) {
    tone = 'neutral';
    label = t('statusChecking');
  } else if (installed === 0) {
    tone = 'neutral';
    label = t('statusNoInstalledEquipment');
  } else if (reporting === 0) {
    tone = 'neutral';
    label = t('statusNoTelemetry');
  } else if (reporting < installed) {
    tone = 'warning';
    label = t('statusTelemetryPartial');
  }

  return (
    <span
      className="front01-bdfb-health"
      data-tone={tone}
      title={
        tone === 'critical'
          ? t('criticalAlarmActive')
          : activeAlarms > 0
            ? t('activeAlarms', { count: activeAlarms })
            : installedEquipmentIds.length > 0
              ? t('installedReporting', { reporting: telemetry.reportingEquipment, installed: installedEquipmentIds.length })
              : t('noInstalledEquipment')
      }
    >
      <i aria-hidden="true" />
      <b>{label}</b>
    </span>
  );
}
