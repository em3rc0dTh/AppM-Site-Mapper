'use client';

import { configuredControllerCapacity } from '@/modules/telemetry/application/controller-summary';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { projectSnmpCapacity } from '@/modules/telemetry/application/snmp-capacity-projection';
import { SnmpFeedCommissioning } from '@/components/power/snmp-feed-commissioning';
import { SnmpFeedHistory } from '@/components/power/snmp-feed-history';
import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';
import { formatOperationalTimestamp } from '@/shared/time/operational-time';

interface PhysicalPanel {
  id: string;
  name: string;
  frameName: string;
}

interface QdfVoltageValue {
  voltageV: number;
  observedAt: string;
  contributingFeeds: number;
}

type SnmpBdfbLoadResponse = SnmpBdfbLoadView & {
  controllerBalance?: {
    authority: 'DIAGNOSTIC_ONLY';
    normalized?: {
      totalA: number | null;
      branchA: number | null;
      remainderA: number | null;
      voltageV: number | null;
      estimatedPowerKw: number | null;
    };
    totalRaw: number | null;
    voltageRaw: number | null;
    branchRaw: number | null;
    remainderRaw: number | null;
    branchStatus: string | null;
    observedAt: string | null;
    coherent: boolean;
  } | null;
  voltageContract?: {
    toleranceV: number | null;
    semantics: string;
    busA: QdfVoltageValue | null;
    busB: QdfVoltageValue | null;
    total: QdfVoltageValue | null;
  };
  qdfOperationalContract?: {
    status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
    metrics: {
      voltage: {
        total: QdfVoltageValue | null;
        busA: QdfVoltageValue | null;
        busB: QdfVoltageValue | null;
      };
      current: { total: { currentA: number } | null };
      power: { total: { powerKw: number } | null };
    };
  };
};

function numeric(value: number | null | undefined, unit: string): string {
  return value === undefined || value === null ? '—' : `${value.toFixed(2)} ${unit}`;
}

function kilowatts(value: number | null | undefined): number | null | undefined {
  return value === undefined || value === null ? value : value / 1000;
}

function OperationalTime({ value }: Readonly<{ value: string | null | undefined }>) {
  const timestamp = formatOperationalTimestamp(value);
  return timestamp ? (
    <time dateTime={timestamp.utc} title={timestamp.audit}>
      {timestamp.display}
    </time>
  ) : (
    <>—</>
  );
}

function readablePanel(panel: PhysicalPanel, frameWord: string, panelWord: string): string {
  const frame = panel.frameName.match(/FRAME-(\d+)/i);
  const position = panel.name.match(/PANEL-(\d+)/i);
  return frame && position ? `${frameWord} ${frame[1]} · ${panelWord} ${position[1]}` : panel.name;
}

export function SnmpFeedLoadPanel({
  deviceId,
  chassisId,
  view = 'all',
}: Readonly<{ deviceId: string; chassisId: string; view?: 'all' | 'summary' | 'feeds' }>) {
  const t = useTranslations('snmpLoad');
  const statusLabel = (status: string): string => {
    switch (status) {
      case 'LIVE':
        return t('statusLive');
      case 'LAB_LIVE':
        return t('statusLive');
      case 'UNVERIFIED':
        return t('statusUnverified');
      case 'CONFLICT':
        return t('statusConflict');
      case 'UNMAPPED':
        return t('statusUnmapped');
      case 'NO_DATA':
        return t('statusNoData');
      case 'STALE':
        return t('statusStale');
      default:
        return status;
    }
  };
  const [load, setLoad] = useState<SnmpBdfbLoadResponse | null>(null);
  const [panels, setPanels] = useState<ReadonlyMap<string, PhysicalPanel>>(new Map());
  const [error, setError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/telemetry/snmp/feeds?deviceId=${encodeURIComponent(deviceId)}`,
          { cache: 'no-store' },
        );
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const result = (await response.json()) as SnmpBdfbLoadResponse;
        if (active) {
          setLoad(result);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    };
    const refreshPanels = async () => {
      try {
        // Same authenticated, Device-scoped repository as the editor. No UUID lookup
        // is performed client-side against arbitrary Equipments.
        const response = await fetch(
          `/api/equipment/${encodeURIComponent(chassisId)}/available-panels`,
          { cache: 'no-store' },
        );
        if (!response.ok) return;
        const result = (await response.json()) as { panels: PhysicalPanel[] };
        if (active) setPanels(new Map(result.panels.map((panel) => [panel.id, panel])));
      } catch {
        // The live measurements remain useful if panel-name lookup is unavailable.
      }
    };
    void refresh();
    void refreshPanels();
    const interval = setInterval(() => void refresh(), 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [deviceId, chassisId, refreshVersion]);

  const capacity = load ? projectSnmpCapacity(load) : null;
  const awaitingVerification =
    load?.configurationIssues.some((issue) => issue.includes('NOT_VERIFIED')) ?? false;
  const inventoryRecorded =
    load !== null && load.expectedFeedCount > 0 && load.feedCount === load.expectedFeedCount;
  const labCount = load?.labFreshFeedCount ?? 0;
  const reportingFeeds = load ? load.freshFeedCount + labCount : null;
  const operationalVoltage = load?.qdfOperationalContract?.metrics.voltage;
  const operationalPowerKw = load?.qdfOperationalContract?.metrics.power.total?.powerKw ?? null;
  const operationalCurrentA = load?.qdfOperationalContract?.metrics.current.total?.currentA ?? null;

  const balance = error ? null : load?.controllerBalance;
  const diagnostic = Boolean(
    balance && load?.freshFeedCount === 0 && load?.labFreshFeedCount === 0,
  );
  const raw = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? String(value) + ' RAW' : '—';
  const normalized = diagnostic && balance?.coherent ? balance.normalized : undefined;
  const diagnosticRating = diagnostic && load ? configuredControllerCapacity(load) : null;
  const available = (rated: number | null | undefined, current: number | null | undefined) =>
    typeof rated === 'number' &&
    typeof current === 'number' &&
    Number.isFinite(rated) &&
    Number.isFinite(current) &&
    rated > 0 &&
    current >= 0
      ? Math.max(0, rated - current)
      : null;
  const usage = (rated: number | null | undefined, current: number | null | undefined) =>
    typeof rated === 'number' &&
    typeof current === 'number' &&
    Number.isFinite(rated) &&
    Number.isFinite(current) &&
    rated > 0 &&
    current >= 0
      ? (current / rated) * 100
      : null;
  const currentFor = (id: string) => {
    const side = load?.feeds.find((feed) => feed.accessPortId === id)?.side;
    return side === 'A' ? normalized?.remainderA : side === 'B' ? normalized?.branchA : null;
  };
  const rawCurrentFor = (id: string) => {
    const side = load?.feeds.find((feed) => feed.accessPortId === id)?.side;
    return side === 'A' ? balance?.remainderRaw : side === 'B' ? balance?.branchRaw : null;
  };
  const currentText = (
    value: number | null | undefined,
    rawValue: number | null | undefined,
    unit: string,
  ) => (typeof value === 'number' && Number.isFinite(value) ? numeric(value, unit) : raw(rawValue));

  if (view === 'summary') {
    const totalVoltage = diagnostic
      ? normalized?.voltageV
      : (operationalVoltage?.total?.voltageV ?? load?.voltageContract?.total?.voltageV ?? null);
    const totalCurrent = diagnostic
      ? normalized?.totalA
      : error
        ? null
        : (operationalCurrentA ?? capacity?.measuredA ?? null);
    const powerKw = diagnostic
      ? normalized?.estimatedPowerKw
      : (operationalPowerKw ?? kilowatts(load?.totalEstimatedPowerW) ?? null);
    const ratedA = capacity?.ratedA ?? diagnosticRating;
    const availableA = diagnostic
      ? available(diagnosticRating, normalized?.totalA)
      : capacity?.availableA;
    const utilizationPct = diagnostic
      ? usage(diagnosticRating, normalized?.totalA)
      : capacity?.utilizationPct;

    return (
      <section
        className="front01-snmp-summary front01-snmp-summary--operator"
        aria-label={t('section')}
      >
        <header className="front01-summary-header">
          <strong>{t('compactTitle')}</strong>
          <span>
            {error
              ? t('statusUnavailable')
              : reportingFeeds && load && reportingFeeds === load.expectedFeedCount
                ? t('statusLive')
                : diagnostic
                  ? normalized?.totalA != null
                    ? t('diagnosticBadge')
                    : 'SNMP · RAW'
                  : t('statusPending')}
          </span>
        </header>

        <dl className="front01-snmp-kpis front01-snmp-kpis--operator">
          <div>
            <dt>{t('totalCurrent')}</dt>
            <dd>
              {diagnostic
                ? currentText(normalized?.totalA, balance?.totalRaw, 'A')
                : numeric(totalCurrent, 'A')}
            </dd>
          </div>
          <div>
            <dt>{t('qdfVoltage')}</dt>
            <dd>
              {diagnostic
                ? currentText(normalized?.voltageV, balance?.voltageRaw, 'V')
                : numeric(totalVoltage, 'V')}
            </dd>
          </div>
          <div>
            <dt>{t('approxPower')}</dt>
            <dd>{numeric(powerKw, 'kW')}</dd>
          </div>
          <div>
            <dt>{t('nominalCapacity')}</dt>
            <dd>{numeric(ratedA, 'A')}</dd>
          </div>
          <div>
            <dt>{t('available')}</dt>
            <dd>{numeric(availableA, 'A')}</dd>
          </div>
          <div>
            <dt>{t('utilization')}</dt>
            <dd>{numeric(utilizationPct, '%')}</dd>
          </div>
        </dl>

        <div className="front01-summary-utilization">
          <strong>{t('utilization')}</strong>
          <div
            className="front01-utilization-meter"
            role="meter"
            aria-label={t('utilization')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.max(0, Math.min(100, utilizationPct ?? 0))}
          >
            <span
              style={{
                width: `${Math.max(0, Math.min(100, utilizationPct ?? 0))}%`,
              }}
            />
          </div>
          <b>
            {utilizationPct === null || utilizationPct === undefined
              ? '—'
              : `${utilizationPct.toFixed(2)} %`}
          </b>
        </div>

        {diagnostic && (
          <p className="front01-data-warning" role="status">
            {t('diagnosticBalance', { status: balance?.branchStatus ?? 'UNKNOWN' })}{' '}
            {normalized?.totalA != null
              ? t('diagnosticScaleVerified')
              : t('diagnosticNormalizationPending')}{' '}
            {t('diagnosticShuntDisclaimer')}
          </p>
        )}
        {!diagnostic && (awaitingVerification || !inventoryRecorded) && (
          <p className="front01-data-warning" role="status">
            {awaitingVerification ? t('verifyPending') : t('commissionIncomplete')}
          </p>
        )}
      </section>
    );
  }

  if (view === 'feeds') {
    return (
      <section
        className="front01-inputs-summary front01-inputs-summary--operator"
        aria-label={t('section')}
      >
        <header className="front01-inputs-heading">
          <h2>{t('incoming')}</h2>
          <div>
            <span>{t('protocolSnmp')}</span>
            <strong>
              {error
                ? t('statusUnavailable')
                : reportingFeeds && load && reportingFeeds === load.expectedFeedCount
                  ? t('statusLive')
                  : diagnostic
                    ? normalized?.totalA != null
                      ? t('diagnosticBadge')
                      : 'SNMP · RAW'
                    : t('statusPending')}
            </strong>
          </div>
        </header>

        <div className="front01-inputs-grid">
          {(load?.feeds ?? []).map((feed, index) => {
            const utilization = capacity?.feedUtilization.find(
              (item) => item.accessPortId === feed.accessPortId,
            );
            const mappedPanels = feed.servedPanelIds
              .map((id) => panels.get(id))
              .filter((panel): panel is PhysicalPanel => panel !== undefined);
            const panelLabel =
              mappedPanels.length > 0
                ? mappedPanels
                    .map((panel) => readablePanel(panel, t('frameWord'), t('panelWord')))
                    .join(', ')
                : feed.servedPanelIds.length
                  ? t('assignedPanels', { count: feed.servedPanelIds.length })
                  : '—';
            const currentA = diagnostic ? currentFor(feed.accessPortId) : feed.currentA;
            const utilizationPct = diagnostic
              ? usage(utilization?.ratedA, currentA)
              : (utilization?.utilizationPct ?? null);
            const availableA = diagnostic
              ? available(utilization?.ratedA, currentA)
              : utilization?.availableA;

            return (
              <article
                className="front01-input-column"
                data-side={index % 2 === 0 ? 'a' : 'b'}
                key={feed.accessPortId}
              >
                <div className="front01-input-title">
                  <div>
                    <h3>{feed.feedPosition ?? feed.side ?? feed.label}</h3>
                    <small>{feed.label}</small>
                  </div>
                  <span data-status={feed.status}>{statusLabel(feed.status)}</span>
                </div>

                <div className="front01-input-primary">
                  <div>
                    <span>{t('current')}</span>
                    <strong>
                      {diagnostic
                        ? currentText(currentA, rawCurrentFor(feed.accessPortId), 'A')
                        : numeric(currentA, 'A')}
                    </strong>
                  </div>
                  <div>
                    <span>{t('utilization')}</span>
                    <strong>
                      {utilizationPct === null ? '—' : `${utilizationPct.toFixed(2)} %`}
                    </strong>
                  </div>
                </div>

                <div
                  className="front01-input-meter"
                  role="meter"
                  aria-label={t('shuntUtilization', { label: feed.label })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.max(0, Math.min(100, utilizationPct ?? 0))}
                >
                  <span
                    style={{
                      width: `${Math.max(0, Math.min(100, utilizationPct ?? 0))}%`,
                    }}
                  />
                </div>

                <dl className="front01-input-facts">
                  <dt>{t('ratedSmall')}</dt>
                  <dd>{numeric(utilization?.ratedA, 'A')}</dd>
                  <dt>{t('available')}</dt>
                  <dd>{numeric(availableA, 'A')}</dd>
                  <dt>{t('voltage')}</dt>
                  <dd>{numeric(feed.voltageV, 'V')}</dd>
                  <dt>{t('panel')}</dt>
                  <dd>{panelLabel}</dd>
                  <dt>{t('lastReadingColumn')}</dt>
                  <dd>
                    <OperationalTime value={feed.observedAt} />
                  </dd>
                </dl>
              </article>
            );
          })}
        </div>

        {!load?.feedCount && !error && <p>{t('noFeeds')}</p>}
        <footer className="front01-inputs-note">
          <span>{t('protocolSnmp')}</span>
          <span>{t('independentMeasurements')}</span>
          {load && !load.qdfOperationalContract?.metrics.current.total && (
            <span>{t('noTotal')}</span>
          )}
        </footer>
      </section>
    );
  }

  return (
    <>
      <section className="zip-bdfb-live-average sm-snmp-load" aria-label={t('section')}>
        <header>
          <div>
            <strong>{t('incoming')}</strong>
          </div>
          <span>
            {error
              ? t('statusUnavailable')
              : reportingFeeds && load && reportingFeeds === load.expectedFeedCount
                ? t('statusLive')
                : t('statusPending')}
          </span>
        </header>

        {
          <>
            <div className="zip-bdfb-live-average-grid">
              <div>
                <span>{t('independent')}</span>
                <strong>{numeric(error ? null : capacity?.measuredA, 'A')}</strong>
              </div>
              <div>
                <span>{t('reporting')}</span>
                <strong>
                  {load ? `${load.freshFeedCount + labCount} / ${load.expectedFeedCount}` : '—'}
                </strong>
              </div>
              <div>
                <span>{t('rated')}</span>
                <strong>{numeric(capacity?.ratedA, 'A')}</strong>
              </div>
              <div>
                <span>{t('utilization')}</span>
                <strong>{numeric(capacity?.utilizationPct, '%')}</strong>
              </div>
              <div>
                <span>{t('power')}</span>
                <strong>{numeric(kilowatts(load?.totalEstimatedPowerW), 'kW')}</strong>
              </div>
              <div>
                <span>{t('totalVoltage')}</span>
                <strong>{numeric(load?.voltageContract?.total?.voltageV, 'V')}</strong>
              </div>
              <div>
                <span>{t('busAVoltage')}</span>
                <strong>{numeric(load?.voltageContract?.busA?.voltageV, 'V')}</strong>
              </div>
              <div>
                <span>{t('busBVoltage')}</span>
                <strong>{numeric(load?.voltageContract?.busB?.voltageV, 'V')}</strong>
              </div>
            </div>
            {load?.voltageContract?.toleranceV !== null &&
              load?.voltageContract?.toleranceV !== undefined && (
                <small>
                  {t('voltageTolerance', {
                    value: load.voltageContract.toleranceV.toFixed(2),
                  })}
                </small>
              )}

            {capacity && (
              <div className="sm-snmp-capacity-lab" aria-label={t('capacity')}>
                <div className="sm-snmp-capacity-line">
                  <strong>{t('capacityTitle')}</strong>
                  <span>
                    {t('freshFeeds', {
                      reporting: capacity.reportingFeeds,
                      expected: capacity.expectedFeeds,
                    })}
                  </span>
                </div>
                <div className="sm-snmp-capacity-numbers">
                  <div>
                    <small>{t('used')}</small>
                    <strong>{numeric(capacity.measuredA, 'A')}</strong>
                  </div>
                  <div>
                    <small>{t('ratedSmall')}</small>
                    <strong>{numeric(capacity.ratedA, 'A')}</strong>
                  </div>
                  <div>
                    <small>{t('available')}</small>
                    <strong>{numeric(capacity.availableA, 'A')}</strong>
                  </div>
                </div>
                {capacity.utilizationPct !== null && (
                  <div className="sm-snmp-capacity-meter">
                    <div
                      role="meter"
                      aria-label={t('utilization')}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.max(0, Math.min(100, capacity.utilizationPct))}
                    >
                      <span
                        style={{ width: `${Math.max(0, Math.min(100, capacity.utilizationPct))}%` }}
                      />
                    </div>
                    <strong>
                      {t('percentOfCapacity', { percent: capacity.utilizationPct.toFixed(1) })}
                    </strong>
                    {!!capacity.overloadedByA && capacity.overloadedByA > 0 && (
                      <small role="status">
                        {t('aboveRating', { current: numeric(capacity.overloadedByA, 'A') })}
                      </small>
                    )}
                  </div>
                )}
                <div className="sm-snmp-capacity-feeds">
                  {capacity.feedUtilization.map((feed) => (
                    <div className="sm-snmp-capacity-feed" key={feed.accessPortId}>
                      <div>
                        <strong>Shunt {feed.label}</strong>
                        <span>
                          {feed.status === 'LIVE' || feed.status === 'LAB_LIVE'
                            ? `${numeric(feed.measuredA, 'A')} / ${numeric(feed.ratedA, 'A')}`
                            : feed.status}
                        </span>
                      </div>
                      {feed.utilizationPct !== null ? (
                        <>
                          <div
                            className="sm-snmp-capacity-feed-meter"
                            role="meter"
                            aria-label={t('shuntUtilization', { label: feed.label })}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.max(0, Math.min(100, feed.utilizationPct))}
                          >
                            <span
                              style={{
                                width: `${Math.max(0, Math.min(100, feed.utilizationPct))}%`,
                              }}
                            />
                          </div>
                          <small>
                            {t('utilizationAvailable', {
                              percent: feed.utilizationPct.toFixed(1),
                              available: numeric(feed.availableA, 'A'),
                            })}
                            {feed.overloadedByA
                              ? t('overRating', { current: numeric(feed.overloadedByA, 'A') })
                              : ''}
                          </small>
                        </>
                      ) : (
                        <small>{feed.ratedA === null ? t('ratedMissing') : t('noFresh')}</small>
                      )}
                    </div>
                  ))}
                </div>
                {capacity.reportingFeeds < capacity.expectedFeeds && <p>{t('partial')}</p>}
                {capacity.reportingFeeds === capacity.expectedFeeds && capacity.ratedA === null && (
                  <p>
                    {t('ratedMissingHelp')}{' '}
                    <Link href={`/device/${encodeURIComponent(chassisId)}#bdfb-access-ports`}>
                      {t('configureRatings')}
                    </Link>
                  </p>
                )}
              </div>
            )}
            {load?.hardwareProfile && (
              <div className="sm-snmp-inventory-summary">
                <strong>
                  {load.hardwareProfile === 'ELTEK_BDCBB_CONFIG_2' ? t('config2') : t('config4')}
                </strong>
                <span>
                  {t('inputsRecorded', { count: load.feedCount, total: load.expectedFeedCount })}
                </span>
                {awaitingVerification && <small>{t('verifyPending')}</small>}
                {!awaitingVerification && load.inventoryStatus === 'INCOMPLETE' && (
                  <small>{t('commissionIncomplete')}</small>
                )}
                {!!load.missingFeedPositions.length && (
                  <small>{t('missing', { positions: load.missingFeedPositions.join(', ') })}</small>
                )}
                {!inventoryRecorded && <small>{t('addInputs')}</small>}
              </div>
            )}
          </>
        }
        {
          <>
            <div
              className={
                load?.hardwareProfile === 'ELTEK_BDCBB_CONFIG_4'
                  ? 'sm-snmp-feed-cards sm-snmp-config4'
                  : 'sm-snmp-feed-cards'
              }
            >
              {load?.feeds.map((feed) => {
                const mappedPanels = feed.servedPanelIds
                  .map((id) => panels.get(id))
                  .filter((panel): panel is PhysicalPanel => panel !== undefined);
                return (
                  <article key={feed.accessPortId} className="sm-snmp-feed-card">
                    <div className="sm-snmp-feed-card-heading">
                      <strong>{feed.label}</strong>
                      <span>{feed.status === 'LAB_LIVE' ? t('statusLive') : feed.status}</span>
                    </div>
                    <small>
                      {feed.feedPosition
                        ? t('inputSide', { position: feed.feedPosition })
                        : feed.side
                          ? t('side', { side: feed.side })
                          : t('unassignedSide')}
                    </small>
                    <div className="sm-snmp-feed-readings">
                      <div>
                        <span>{t('current')}</span>
                        <strong>{numeric(feed.currentA, 'A')}</strong>
                      </div>
                      <div>
                        <span>{t('voltage')}</span>
                        <strong>{numeric(feed.voltageV, 'V')}</strong>
                      </div>
                    </div>
                    <div className="sm-snmp-feed-details">
                      <small>
                        {t('controller')} {feed.sourceIdentity ?? t('notMapped')}
                      </small>
                      {feed.currentOid && (
                        <small>
                          {t('currentOid')} {feed.currentOid}
                        </small>
                      )}
                      {feed.observedAt && (
                        <small>
                          {t('last')} <OperationalTime value={feed.observedAt} />
                        </small>
                      )}
                      <div className="sm-snmp-panel-list">
                        <span>{t('panels')}</span>
                        {mappedPanels.length > 0 ? (
                          mappedPanels.map((panel) => (
                            <span className="sm-snmp-panel-label" key={panel.id}>
                              {readablePanel(panel, t('frameWord'), t('panelWord'))}
                            </span>
                          ))
                        ) : (
                          <small>
                            {feed.servedPanelIds.length
                              ? t('assignedPanels', { count: feed.servedPanelIds.length })
                              : t('noPanelsAssigned')}
                          </small>
                        )}
                      </div>
                      {feed.status === 'LIVE' && feed.overloadWarning !== null && (
                        <small>
                          {t('overload')} {feed.overloadWarning ? t('warning') : t('normal')}
                          {feed.overloadThresholdA !== null
                            ? t('threshold', { current: feed.overloadThresholdA })
                            : ''}
                        </small>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {!load?.feedCount && !error && <p>{t('noFeeds')}</p>}
            {(load as (SnmpBdfbLoadView & { historyAvailable?: boolean }) | null)
              ?.historyAvailable === false && <p role="alert">{t('timescaleUnavailable')}</p>}
            {load && !load.qdfOperationalContract?.metrics.current.total && (
              <p className="sm-snmp-no-total">{t('noTotal')}</p>
            )}
            <small>{t('snmpSeparate')}</small>
          </>
        }
      </section>
      {view === 'all' && (
        <>
          <SnmpFeedHistory deviceId={deviceId} />
          <SnmpFeedCommissioning
            deviceId={deviceId}
            chassisId={chassisId}
            onInventoryChanged={() => setRefreshVersion((version) => version + 1)}
          />
        </>
      )}
    </>
  );
}
