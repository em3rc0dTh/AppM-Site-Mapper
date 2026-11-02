'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';
import { compactAlarmPath } from '@/components/alarm/alarm-path';
import { useTelemetryStream } from '@/components/telemetry/use-bdfb-telemetry';
import {
  aggregateBdfbDescendantTelemetry,
  type BdfbDescendantTelemetry,
} from '@/modules/telemetry/application/bdfb-descendant-telemetry';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { WorkspaceBdfbSummary } from '@/modules/workspace/application/workspace-service';

type Pin = { id: string; name: string; kind: string; context: string; href: string };
type BdfbRow = WorkspaceBdfbSummary & BdfbDescendantTelemetry;
type HomeModal = 'alarms' | 'access' | null;

function fresh(iso: string, now: number): boolean {
  const age = now - Date.parse(iso);
  return Number.isFinite(age) && age >= -30_000 && age <= 30_000;
}

function projectBdfb(
  samples: readonly TelemetrySample[],
  item: WorkspaceBdfbSummary,
  now: number,
): BdfbRow {
  return {
    ...item,
    ...aggregateBdfbDescendantTelemetry(samples, item.descendantEquipmentIds, now),
  };
}

function format(value: number | null, unit: string, decimals = 2): string {
  return value === null ? '—' : `${value.toFixed(decimals)} ${unit}`;
}

export function HomeLiveOverview({
  equipmentIds,
  bdfbs,
  cards,
  initialSamples,
}: {
  equipmentIds: readonly string[];
  bdfbs: readonly WorkspaceBdfbSummary[];
  cards: readonly Pin[];
  initialSamples: readonly TelemetrySample[];
}) {
  const t = useTranslations('workspaceUi');
  const alarmT = useTranslations('alarmUi.home');
  const [modal, setModal] = useState<HomeModal>(null);
  const { samples: streamed, now, hasSnapshot } = useTelemetryStream();
  const { snapshot: alarmSnapshot, error: alarmError } = useAlarmSnapshot();
  const samples = hasSnapshot ? streamed : initialSamples;
  const rows = bdfbs.map((item) => projectBdfb(samples, item, now));
  const online = equipmentIds.filter(
    (id) =>
      rows.some((row) => row.deviceId === id && row.reportingEquipment > 0) ||
      samples.some(
        (sample) =>
          sample.targetId === id &&
          sample.metricBindingIds?.length &&
          fresh(sample.receivedAt, now),
      ),
  ).length;
  const unknown = equipmentIds.length - online;
  const activeAlarms = alarmSnapshot.occurrences.filter((alarm) => alarm.lifecycle === 'ACTIVE');
  const previewAlarms = activeAlarms.slice(0, 2);
  const previewCards = cards.slice(0, 3);

  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modal]);

  const renderPin = (pin: Pin, compact = false) => {
    const bdfb = rows.find((row) => row.deviceId === pin.id);
    return (
      <Link
        href={pin.href}
        className={`sm-home-pin${compact ? ' sm-home-pin--compact' : ''}`}
        key={pin.id}
      >
        <div>
          <span>▣</span>
          <strong>{pin.name}</strong>
        </div>
        <small title={pin.context}>{pin.context}</small>
        {bdfb ? (
          <>
            <div className="sm-home-pin-readings">
              <span>
                {t('voltage')} <b>{format(bdfb.averageVoltageV, 'V')}</b>
              </span>
              <span>
                {t('current')} <b>{format(bdfb.averageCurrentA, 'A')}</b>
              </span>
              <span>
                {t('power')} <b>{format(bdfb.averagePowerW, 'W')}</b>
              </span>
              <span>
                {t('energyCounter')} <b>{format(bdfb.averageEnergyKwh, 'kWh', 4)}</b>
              </span>
              <span>
                {t('totalPower')}{' '}
                <b>{format(bdfb.totalPowerW === null ? null : bdfb.totalPowerW / 1000, 'kW')}</b>
              </span>
              <span>
                {t('equipmentReporting')}{' '}
                <b>
                  {bdfb.reportingEquipment} / {bdfb.descendantEquipment}
                </b>
              </span>
            </div>
            {!compact && (
              <small className="sm-home-telemetry-note">
                {t('entireBdfb')} {bdfb.latestReceivedAt ?? '—'}
              </small>
            )}
          </>
        ) : (
          <p>{t('details')}</p>
        )}
        <em>{t('open')}</em>
      </Link>
    );
  };

  const renderAlarmList = (alarms: typeof activeAlarms) => (
    <div className="sm-home-alarm-list">
      {alarms.map((alarm) => (
        <article key={alarm.id} data-severity={alarm.severity}>
          <div>
            <strong>{alarm.name}</strong>
            <span>
              {alarm.severity}
              {alarm.confidence ? ' · ' + alarm.confidence : ''}
            </span>
            <small title={alarm.path.map((item) => item.name).join(' › ')}>
              {compactAlarmPath(alarm.path)
                .map((item) => item.name)
                .join(' › ')}
            </small>
          </div>
          <Link href={alarm.targetHref}>{alarmT('goToTarget')}</Link>
        </article>
      ))}
    </div>
  );

  return (
    <>
      <div className="sm-home-stats">
        <article>
          <small>{t('primary')}</small>
          <strong>{equipmentIds.length}</strong>
          <span>{t('managed')}</span>
        </article>
        <article>
          <small>{t('reporting')}</small>
          <strong>{online}</strong>
          <span>{t('reportingHelp')}</span>
        </article>
        <article>
          <small>{t('noRecent')}</small>
          <strong>{unknown}</strong>
          <span>{t('unknown')}</span>
        </article>
      </div>

      <div className="sm-home-action-grid">
        <section className="sm-home-section sm-home-alarm-section" aria-label={alarmT('active')}>
          <div className="sm-home-section-heading">
            <h2>{alarmT('active')}</h2>
            <button type="button" onClick={() => setModal('alarms')}>
              {t('viewMore')}
            </button>
          </div>
          {alarmError ? (
            <p className="sm-alarm-unavailable">{alarmT('unavailable')}</p>
          ) : alarmSnapshot.global.activeAlarmCount === 0 ? (
            <p className="sm-alarm-empty">{alarmT('none')}</p>
          ) : (
            <>
              <div className="sm-home-alarm-counters">
                <span data-severity="CRITICAL">
                  <b>{alarmSnapshot.global.critical}</b> {alarmT('critical')}
                </span>
                <span data-severity="WARNING">
                  <b>{alarmSnapshot.global.warning}</b> {alarmT('warning')}
                </span>
                <span data-severity="INFO">
                  <b>{alarmSnapshot.global.info}</b> {alarmT('info')}
                </span>
              </div>
              <div className="sm-home-panel-preview">{renderAlarmList(previewAlarms)}</div>
            </>
          )}
        </section>

        <section className="sm-home-section sm-home-access-section" aria-label={t('direct')}>
          <div className="sm-home-section-heading">
            <h2>{t('direct')}</h2>
            <button type="button" onClick={() => setModal('access')}>
              {t('viewMore')}
            </button>
          </div>
          <div className="sm-home-panel-preview">
            <div className="sm-home-pin-grid sm-home-pin-grid--preview">
              {previewCards.map((pin) => renderPin(pin, true))}
              {previewCards.length < 3 && (
                <Link className="sm-home-pin sm-home-add-pin sm-home-pin--compact" href="/network">
                  {t('addPinned')}
                </Link>
              )}
            </div>
          </div>
        </section>
      </div>

      {modal && (
        <div
          className="sm-home-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <section
            className="sm-home-modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal === 'alarms' ? alarmT('active') : t('direct')}
          >
            <header>
              <div>
                <small>{t('workspace')}</small>
                <h2>{modal === 'alarms' ? alarmT('active') : t('direct')}</h2>
              </div>
              <button type="button" onClick={() => setModal(null)} aria-label={t('close')}>
                ×
              </button>
            </header>

            <div className="sm-home-modal-body">
              {modal === 'alarms' ? (
                <>
                  <div className="sm-home-modal-toolbar">
                    <div className="sm-home-alarm-counters">
                      <span data-severity="CRITICAL">
                        <b>{alarmSnapshot.global.critical}</b> {alarmT('critical')}
                      </span>
                      <span data-severity="WARNING">
                        <b>{alarmSnapshot.global.warning}</b> {alarmT('warning')}
                      </span>
                      <span data-severity="INFO">
                        <b>{alarmSnapshot.global.info}</b> {alarmT('info')}
                      </span>
                    </div>
                    <Link href="/alarms">{alarmT('viewAll')}</Link>
                  </div>
                  {activeAlarms.length ? renderAlarmList(activeAlarms) : <p>{alarmT('none')}</p>}
                </>
              ) : (
                <>
                  <div className="sm-home-modal-toolbar">
                    <span>{t('pinned')}</span>
                    <Link href="/network">{t('managePins')}</Link>
                  </div>
                  <div className="sm-home-pin-grid sm-home-pin-grid--modal">
                    {cards.map((pin) => renderPin(pin))}
                    <Link className="sm-home-pin sm-home-add-pin" href="/network">
                      {t('addPinned')}
                    </Link>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
