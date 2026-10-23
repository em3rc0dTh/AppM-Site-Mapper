'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useTelemetryStream } from '@/components/telemetry/use-bdfb-telemetry';
import {
  aggregateBdfbDescendantTelemetry,
  type BdfbDescendantTelemetry,
} from '@/modules/telemetry/application/bdfb-descendant-telemetry';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { WorkspaceBdfbSummary } from '@/modules/workspace/application/workspace-service';

type Pin = { id: string; name: string; kind: string; context: string; href: string };
type BdfbRow = WorkspaceBdfbSummary & BdfbDescendantTelemetry;

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
  const { samples: streamed, now, hasSnapshot } = useTelemetryStream();
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
  const reporting = rows.filter((row) => row.totalPowerW !== null);
  const totalPowerW = reporting.reduce((sum, row) => sum + row.totalPowerW!, 0);
  const partial = reporting.length !== rows.length;
  const monitoring = rows.filter((row) => row.reportingEquipment > 0).length;

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

      <section className="sm-home-section">
        <div className="sm-home-section-heading">
          <h2>{t('direct')}</h2>
          <Link href="/network">{t('managePins')}</Link>
        </div>
        <div className="sm-home-pin-grid">
          {cards.map((pin) => {
            const bdfb = rows.find((row) => row.deviceId === pin.id);
            return (
              <Link href={pin.href} className="sm-home-pin" key={pin.id}>
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
                        <b>
                          {format(bdfb.totalPowerW === null ? null : bdfb.totalPowerW / 1000, 'kW')}
                        </b>
                      </span>
                      <span>
                        {t('equipmentReporting')}{' '}
                        <b>
                          {bdfb.reportingEquipment} / {bdfb.descendantEquipment}
                        </b>
                      </span>
                    </div>
                    <small className="sm-home-telemetry-note">
                      {t('entireBdfb')} {bdfb.latestReceivedAt ?? '—'}
                    </small>
                  </>
                ) : (
                  <p>{t('details')}</p>
                )}
                <em>{t('open')}</em>
              </Link>
            );
          })}
          <Link className="sm-home-pin sm-home-add-pin" href="/network">
            {t('addPinned')}
          </Link>
        </div>
      </section>

      <section className="sm-home-section" aria-label={t('systemBdfb')}>
        <div className="sm-home-section-heading">
          <h2>{t('overview')}</h2>
          <span>{t('systemWide')}</span>
        </div>
        <div className="sm-home-stats">
          <article>
            <small>{t('livePower')}</small>
            <strong>{reporting.length ? format(totalPowerW / 1000, 'kW') : '—'}</strong>
            <span>{partial ? t('partial') : t('powerSum')}</span>
          </article>
          <article>
            <small>{t('periodEnergy')}</small>
            <strong>—</strong>
            <span>{t('periodUnavailable')}</span>
          </article>
          <article>
            <small>{t('monitoring')}</small>
            <strong>
              {monitoring} / {rows.length}
            </strong>
            <span>{t('monitoringHelp')}</span>
          </article>
        </div>
        {partial && (
          <p className="sm-home-warning">
            {t('partialWarning', { count: rows.length - reporting.length })}
          </p>
        )}
        <div className="sm-home-section-heading">
          <h2>{t('telemetryByBdfb')}</h2>
          <Link href="/telemetry">{t('telemetryLink')}</Link>
        </div>
        <div className="sm-home-table-wrap">
          <table className="sm-home-table">
            <thead>
              <tr>
                <th>BDFB</th>
                <th>{t('avgV')}</th>
                <th>{t('avgA')}</th>
                <th>{t('avgW')}</th>
                <th>{t('avgCounter')}</th>
                <th>{t('totalKw')}</th>
                <th>{t('reportingEquipment')}</th>
                <th>{t('lastSample')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.deviceId}>
                  <td>
                    <strong>{row.deviceName}</strong>
                  </td>
                  <td>{format(row.averageVoltageV, 'V')}</td>
                  <td>{format(row.averageCurrentA, 'A')}</td>
                  <td>{format(row.averagePowerW, 'W')}</td>
                  <td>{format(row.averageEnergyKwh, 'kWh', 4)}</td>
                  <td>{format(row.totalPowerW === null ? null : row.totalPowerW / 1000, 'kW')}</td>
                  <td>
                    {row.reportingEquipment} / {row.descendantEquipment}
                  </td>
                  <td>{row.latestReceivedAt ?? '—'}</td>
                  <td>
                    <Link href={row.href}>Open →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="sm-home-warning">{t('noBdfbs')}</p>}
        </div>
        <p className="sm-home-telemetry-note">{t('methodNote')}</p>
      </section>
    </>
  );
}
