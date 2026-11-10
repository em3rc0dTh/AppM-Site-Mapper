'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { projectSnmpCapacity } from '@/modules/telemetry/application/snmp-capacity-projection';
import { SnmpFeedCommissioning } from '@/components/power/snmp-feed-commissioning';
import { SnmpFeedHistory } from '@/components/power/snmp-feed-history';
import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';

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
  voltageContract?: {
    toleranceV: number | null;
    semantics: string;
    busA: QdfVoltageValue | null;
    busB: QdfVoltageValue | null;
    total: QdfVoltageValue | null;
  };
};

function numeric(value: number | null | undefined, unit: string): string {
  return value === undefined || value === null ? '—' : `${value.toFixed(2)} ${unit}`;
}

function kilowatts(value: number | null | undefined): number | null | undefined {
  return value === undefined || value === null ? value : value / 1000;
}

function readablePanel(panel: PhysicalPanel): string {
  const frame = panel.frameName.match(/FRAME-(\d+)/i);
  const position = panel.name.match(/PANEL-(\d+)/i);
  return frame && position ? `Frame ${frame[1]} · Panel ${position[1]}` : panel.name;
}

export function SnmpFeedLoadPanel({
  deviceId,
  chassisId,
  view = 'all',
}: Readonly<{ deviceId: string; chassisId: string; view?: 'all' | 'summary' | 'feeds' }>) {
  const t = useTranslations('snmpLoad');
  const [load, setLoad] = useState<SnmpBdfbLoadResponse | null>(null);
  const [panels, setPanels] = useState<ReadonlyMap<string, PhysicalPanel>>(new Map());
  const [error, setError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [labEnabled, setLabEnabled] = useState(false);
  const [labSource, setLabSource] = useState<string | null>(null);
  const [labBusy, setLabBusy] = useState(false);
  const [labError, setLabError] = useState('');
  const [labConfigured, setLabConfigured] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch(`/api/dev/snmp-lab/commission?deviceId=${encodeURIComponent(deviceId)}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { enabled: boolean; sourceIdentity?: string };
        if (active) {
          setLabEnabled(data.enabled);
          setLabSource(data.sourceIdentity ?? null);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [deviceId]);

  async function commissionLab() {
    if (!window.confirm(t('confirmLab'))) return;
    setLabBusy(true);
    setLabError('');
    try {
      const response = await fetch('/api/dev/snmp-lab/commission', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId, confirmSyntheticOnly: true }),
      });
      const body = (await response.json()) as { error?: string; issues?: string[] };
      if (!response.ok)
        throw new Error(
          [body.error ?? `HTTP_${response.status}`, ...(body.issues ?? [])].join(' · '),
        );
      setLabConfigured(true);
      setRefreshVersion((version) => version + 1);
    } catch (cause) {
      setLabError(cause instanceof Error ? cause.message : 'LAB_MAPPING_FAILED');
    } finally {
      setLabBusy(false);
    }
  }

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
  const isLab = capacity?.mode === 'LAB_SIMULATED';
  const reportingFeeds = load ? load.freshFeedCount + labCount : null;

  if (view === 'summary') {
    return (
      <section className="front01-snmp-summary" aria-label={t('section')}>
        <header className="front01-summary-header">
          <strong>ENTRADAS DC · SNMP</strong>
          <span>{error ? t('statusUnavailable') : isLab ? 'LAB SIMULATED' : load?.status === 'COMPLETE' ? 'LIVE' : t('statusPending')}</span>
        </header>

        <dl className="front01-snmp-kpis">
          <div><dt>Corriente total</dt><dd>{numeric(error ? null : capacity?.measuredA, 'A')}</dd></div>
          <div><dt>Capacidad nominal</dt><dd>{numeric(capacity?.ratedA, 'A')}</dd></div>
          <div><dt>Disponible</dt><dd>{numeric(capacity?.availableA, 'A')}</dd></div>
          <div><dt>Utilización</dt><dd>{numeric(capacity?.utilizationPct, '%')}</dd></div>
          <div><dt>Voltaje QDF</dt><dd>{numeric(load?.voltageContract?.total?.voltageV, 'V')}</dd></div>
          <div><dt>Bus A</dt><dd>{numeric(load?.voltageContract?.busA?.voltageV, 'V')}</dd></div>
          <div><dt>Potencia aprox.</dt><dd>{numeric(kilowatts(load?.totalEstimatedPowerW), 'kW')}</dd></div>
          <div><dt>Bus B</dt><dd>{numeric(load?.voltageContract?.busB?.voltageV, 'V')}</dd></div>
        </dl>

        <div className="front01-snmp-table-wrap">
          <table className="front01-snmp-table">
            <thead>
              <tr>
                <th>Shunt</th>
                <th>Corriente</th>
                <th>Nominal</th>
                <th>Uso</th>
                <th>Disponible</th>
              </tr>
            </thead>
            <tbody>
              {(capacity?.feedUtilization ?? []).map((feed) => (
                <tr key={feed.accessPortId}>
                  <td>{feed.label}</td>
                  <td>{numeric(feed.measuredA, 'A')}</td>
                  <td>{numeric(feed.ratedA, 'A')}</td>
                  <td>{feed.utilizationPct === null ? '—' : `${feed.utilizationPct.toFixed(1)}%`}</td>
                  <td>{numeric(feed.availableA, 'A')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="front01-snmp-footer">
          <strong>
            Entradas activas {reportingFeeds === null || !load ? '—' : `${reportingFeeds} / ${load.expectedFeedCount}`}
          </strong>
          {capacity?.utilizationPct !== null && capacity?.utilizationPct !== undefined ? (
            <>
              <div
                className="front01-utilization-meter"
                role="meter"
                aria-label={isLab ? t('simulatedUtilization') : t('verifiedUtilization')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.max(0, Math.min(100, capacity.utilizationPct))}
              >
                <span style={{ width: `${Math.max(0, Math.min(100, capacity.utilizationPct))}%` }} />
              </div>
              <b>{capacity.utilizationPct.toFixed(1)}%</b>
            </>
          ) : null}
        </div>
      </section>
    );
  }

  if (view === 'feeds') {
    return (
      <section className="front01-inputs-summary" aria-label={t('section')}>
        <header className="front01-summary-header">
          <strong>ENTRADAS DC · SNMP</strong>
          <span>
            {error
              ? t('statusUnavailable')
              : labCount > 0
                ? 'LAB SIMULATED'
                : load?.status === 'COMPLETE'
                  ? 'LIVE'
                  : t('statusPending')}
          </span>
        </header>

        {labEnabled && inventoryRecorded && labCount === 0 && (
          <div className="front01-inputs-lab-action">
            <span>{t('labController', { controller: labSource ?? t('notSelected') })}</span>
            <button type="button" disabled={labBusy} onClick={() => void commissionLab()}>
              {labBusy ? t('configuring') : t('connectSynthetic')}
            </button>
            {labConfigured && <small role="status">{t('labMapped')}</small>}
            {labError && <small role="alert" className="form-error">{labError}</small>}
          </div>
        )}

        <div className="front01-inputs-table-wrap">
          <table className="front01-inputs-table">
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Estado</th>
                <th>Corriente</th>
                <th>Voltaje</th>
                <th>Panel</th>
                <th>Controller</th>
                <th>OID corriente</th>
                <th>Última lectura</th>
              </tr>
            </thead>
            <tbody>
              {load?.feeds.map((feed) => {
                const mappedPanels = feed.servedPanelIds
                  .map((id) => panels.get(id))
                  .filter((panel): panel is PhysicalPanel => panel !== undefined);
                const panelLabel =
                  mappedPanels.length > 0
                    ? mappedPanels.map(readablePanel).join(', ')
                    : feed.servedPanelIds.length
                      ? t('assignedPanels', { count: feed.servedPanelIds.length })
                      : '—';

                return (
                  <tr key={feed.accessPortId}>
                    <td>
                      <strong>{feed.label}</strong>
                      <small>
                        {feed.feedPosition
                          ? t('inputSide', { position: feed.feedPosition })
                          : feed.side
                            ? t('side', { side: feed.side })
                            : t('unassignedSide')}
                      </small>
                    </td>
                    <td>{feed.status === 'LAB_LIVE' ? 'LAB LIVE · SIMULATED' : feed.status}</td>
                    <td>{numeric(feed.currentA, 'A')}</td>
                    <td>{numeric(feed.voltageV, 'V')}</td>
                    <td>{panelLabel}</td>
                    <td>{feed.sourceIdentity ?? t('notMapped')}</td>
                    <td><code>{feed.currentOid ?? '—'}</code></td>
                    <td>{feed.observedAt ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!load?.feedCount && !error && <p>{t('noFeeds')}</p>}
        <footer className="front01-inputs-note">
          <span>
            {labCount > 0
              ? `SIMULATED SNMP · ${labCount} shunts reporting`
              : 'SNMP'}
          </span>
          <span>Mediciones de shunt independientes de la telemetría MQTT descendiente.</span>
          {load?.status !== 'COMPLETE' && <span>{t('noTotal')}</span>}
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
              : load?.status === 'COMPLETE'
                ? t('statusLive')
                : labCount > 0
                  ? t('statusLab')
                  : t('statusPending')}
          </span>
        </header>

        {view !== 'feeds' && (
          <>
            <div className="zip-bdfb-live-average-grid">
              <div>
                <span>{isLab ? t('simulated') : t('independent')}</span>
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
                  <strong>{isLab ? t('capacityLab') : t('capacityTitle')}</strong>
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
                      aria-label={isLab ? t('simulatedUtilization') : t('verifiedUtilization')}
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
                        <strong>
                          Shunt {feed.label} {feed.status === 'LAB_LIVE' ? '· SIMULATED' : ''}
                        </strong>
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
                {isLab && <p>{t('simulationNote')}</p>}
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
        )}
        {(
          <>
            {labEnabled && inventoryRecorded && labCount === 0 && (
              <div className="sm-snmp-lab-activation">
                <strong>{t('lab')}</strong>
                <small>{t('labController', { controller: labSource ?? t('notSelected') })}</small>
                <button type="button" disabled={labBusy} onClick={() => void commissionLab()}>
                  {labBusy ? t('configuring') : t('connectSynthetic')}
                </button>
                {labConfigured && (
                  <small role="status">
                    {t('labMapped')}
                    <code>
                      bash scripts/lab/bfdb-snmp-config4.sh collectors ../bfdb-telemetry-gateway
                    </code>
                  </small>
                )}
                {labError && (
                  <small role="alert" className="form-error">
                    {labError}
                  </small>
                )}
              </div>
            )}
            {labCount > 0 && (
              <p className="sm-snmp-lab-disclaimer">{t('simulatedNotice', { count: labCount })}</p>
            )}
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
                      <span>{feed.status === 'LAB_LIVE' ? t('labLive') : feed.status}</span>
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
                          {t('last')} {feed.observedAt}
                        </small>
                      )}
                      <div className="sm-snmp-panel-list">
                        <span>{t('panels')}</span>
                        {mappedPanels.length > 0 ? (
                          mappedPanels.map((panel) => (
                            <span className="sm-snmp-panel-label" key={panel.id}>
                              {readablePanel(panel)}
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
            {load?.status !== 'COMPLETE' && <p className="sm-snmp-no-total">{t('noTotal')}</p>}
            <small>{t('snmpSeparate')}</small>
          </>
        )}
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
