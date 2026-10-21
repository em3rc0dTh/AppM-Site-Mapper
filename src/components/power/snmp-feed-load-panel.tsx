'use client';

import { useEffect, useState } from 'react';
import { SnmpFeedCommissioning } from '@/components/power/snmp-feed-commissioning';
import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';

function numeric(value: number | null, unit: string): string {
  return value === null ? '—' : `${value.toFixed(2)} ${unit}`;
}
export function SnmpFeedLoadPanel({
  deviceId,
  chassisId,
}: Readonly<{ deviceId: string; chassisId: string }>) {
  const [load, setLoad] = useState<(SnmpBdfbLoadView & { historyAvailable?: boolean }) | null>(
    null,
  );
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/telemetry/snmp/feeds?deviceId=${encodeURIComponent(deviceId)}`,
          { cache: 'no-store' },
        );
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const result = (await response.json()) as SnmpBdfbLoadView;
        if (active) {
          setLoad(result);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [deviceId]);

  const percent =
    load?.totalRatedCurrentA && load.totalCurrentA !== null && load.totalCurrentA !== undefined
      ? (load.totalCurrentA / load.totalRatedCurrentA) * 100
      : null;
  return (
    <>
      <section className="zip-bdfb-live-average" aria-label="BDFB SNMP input feed load">
        <header>
          <div>
            <strong>SNMP · INCOMING DC FEEDS</strong>
          </div>
          <span>{error ? 'UNAVAILABLE' : (load?.status ?? 'LOADING')}</span>
        </header>
        <div className="zip-bdfb-live-average-grid">
          <div>
            <span>INDEPENDENT FEED CURRENT</span>
            <strong>
              {!error && load?.status === 'COMPLETE' ? numeric(load.totalCurrentA, 'A') : '—'}
            </strong>
          </div>
          <div>
            <span>FEEDS LIVE / REQUIRED</span>
            <strong>{load ? `${load.freshFeedCount} / ${load.expectedFeedCount}` : '—'}</strong>
          </div>
          <div>
            <span>RATED INPUT CAPACITY</span>
            <strong>{numeric(load?.totalRatedCurrentA ?? null, 'A')}</strong>
          </div>
          <div>
            <span>INPUT UTILIZATION</span>
            <strong>{numeric(percent, '%')}</strong>
          </div>
          <div>
            <span>APPROX. INPUT POWER</span>
            <strong>{numeric(load?.totalEstimatedPowerW ?? null, 'W')}</strong>
          </div>
        </div>
        {load?.hardwareProfile && (
          <div className="zip-bdfb-live-average-counts">
            <strong>HARDWARE PROFILE · {load.hardwareProfile}</strong>
            <span>PHYSICAL INVENTORY: {load.inventoryStatus}</span>
            <small>
              Installed input ports: {load.feedCount} / {load.expectedFeedCount}
            </small>
            {!!load.missingFeedPositions.length && (
              <small>Missing inputs: {load.missingFeedPositions.join(', ')}</small>
            )}
            {!!load.configurationIssues.length && (
              <small>
                Verify wiring and panel assignments: {load.configurationIssues.join(' · ')}
              </small>
            )}
          </div>
        )}
        {load && load.status !== 'COMPLETE' && (
          <small>
            One or more expected independent inputs are unmapped, stale or unverified. No whole-BDFB
            current total is claimed.
          </small>
        )}
        {load?.historyAvailable === false && (
          <p role="alert">
            TimescaleDB unavailable: restored/latest SNMP readings could not be queried.
          </p>
        )}
        {load?.hardwareProfile === 'ELTEK_BDCBB_CONFIG_4' && (
          <small>PHYSICAL CONFIGURATION 4 · top row A2 / B2, bottom row A1 / B1</small>
        )}
        <div
          className={
            load?.hardwareProfile === 'ELTEK_BDCBB_CONFIG_4'
              ? 'sm-config4-feed-layout'
              : 'sm-generic-feed-layout'
          }
        >
          {load?.feeds.map((feed) => (
            <div key={feed.accessPortId} className="zip-bdfb-live-average-counts">
              <strong>
                {feed.feedPosition ? `INPUT ${feed.feedPosition} · ` : ''}
                {feed.label} {feed.side ? `· side ${feed.side}` : ''}
              </strong>
              <span>{feed.status}</span>
              <small>
                Overload (calculated):{' '}
                {feed.overloadWarning === null
                  ? 'UNKNOWN'
                  : feed.overloadWarning
                    ? 'WARNING'
                    : 'NORMAL'}
                {feed.overloadThresholdA !== null
                  ? ` · threshold ${feed.overloadThresholdA} A`
                  : ''}
              </small>
              <span>
                {numeric(feed.currentA, 'A')} · {numeric(feed.voltageV, 'V')}
              </span>
              <small>
                {numeric(feed.utilizationPct, '%')} of {numeric(feed.ratedCurrentA, 'A')} ·{' '}
                {numeric(feed.estimatedPowerW, 'W')}
              </small>
              <small>
                Controller {feed.sourceIdentity ?? 'UNMAPPED'} · OID {feed.currentOid ?? 'NO OID'}
              </small>
              <small>
                Measured at {feed.observedAt ?? 'No data'} · Supplied panels:{' '}
                {feed.servedPanelIds.join(', ') || 'unverified'}
              </small>
            </div>
          ))}
        </div>
        {!load?.feedCount && !error && (
          <small>No SNMP input feeders inventoried on this BDFB.</small>
        )}
        <small>
          This is incoming measured load, NOT per-breaker current and NOT the downstream Equipment
          Average.
        </small>
      </section>
      <SnmpFeedCommissioning deviceId={deviceId} chassisId={chassisId} />
    </>
  );
}
