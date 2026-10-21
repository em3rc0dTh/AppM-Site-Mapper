'use client';

import { useEffect, useState } from 'react';

import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';

function numeric(value: number | null, unit: string): string {
  return value === null ? '—' : `${value.toFixed(2)} ${unit}`;
}

/** Feed input load is different from the existing BREAKER LIVE AVERAGE. */
export function SnmpFeedLoadPanel({ deviceId }: Readonly<{ deviceId: string }>) {
  const [load, setLoad] = useState<SnmpBdfbLoadView | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/telemetry/snmp/feeds?deviceId=${encodeURIComponent(deviceId)}`,
          { cache: 'no-store', signal: controller.signal },
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
    const interval = setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [deviceId]);

  return (
    <section className="zip-bdfb-live-average" aria-label="BDFB SNMP input feed load">
      <header>
        <div>
          <strong>SNMP · DC INPUT FEEDS</strong>
        </div>
        <span>{error ? 'UNAVAILABLE' : (load?.status ?? 'LOADING')}</span>
      </header>
      <div className="zip-bdfb-live-average-grid">
        <div>
          <span>MEASURED TOTAL</span>
          <strong>
            {!error && load?.status === 'COMPLETE' ? numeric(load.totalCurrentA, 'A') : '—'}
          </strong>
        </div>
        <div>
          <span>FEEDS LIVE</span>
          <strong>{load ? `${load.freshFeedCount} / ${load.feedCount}` : '—'}</strong>
        </div>
      </div>
      {load && load.status !== 'COMPLETE' && (
        <small>Partial/unmapped inputs: no certified whole-BDFB load total.</small>
      )}
      {load?.feeds.map((feed) => (
        <div key={feed.accessPortId} className="zip-bdfb-live-average-counts">
          <strong>
            {feed.label} {feed.side ? `· ${feed.side}` : ''}
          </strong>
          <span>{feed.status}</span>
          <span>{numeric(feed.currentA, 'A')}</span>
          <small>
            {feed.sourceIdentity ?? 'UNMAPPED'} · {feed.currentOid ?? 'NO OID'}
          </small>
        </div>
      ))}
      {!load?.feedCount && !error && <small>No external BDFB input feed ports configured.</small>}
    </section>
  );
}
