'use client';

import { useEffect, useState } from 'react';

import type { BdfbPresentation } from '@/modules/power/domain/bdfb-model';
import { aggregateBdfbTelemetry } from '@/modules/telemetry/application/bdfb-telemetry-aggregate';
import type {
  TelemetryHistoryPoint,
  TelemetryHistoryResponse,
  TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';
import { TELEMETRY_HISTORY_WINDOWS } from '@/modules/telemetry/domain/history';
import type { DeviceNode } from '@/modules/topology/domain/entities';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

type InspectorWindow = 'LIVE' | TelemetryHistoryWindow;
type HistoryMetricKey = 'voltageV' | 'currentA' | 'powerW' | 'energyKwh';

function metric(value: number | null | undefined, unit: string, decimals = 2): string {
  return value === undefined || value === null ? '—' : `${value.toFixed(decimals)} ${unit}`;
}

function compactUtc(value: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : `${parsed.toISOString().slice(11, 19)} UTC`;
}

function useTelemetrySample(deviceId: string): TelemetrySample | null {
  const [sample, setSample] = useState<TelemetrySample | null>(null);

  useEffect(() => {
    const stream = new EventSource('/api/telemetry/stream');

    const onSnapshot = (event: MessageEvent<string>) => {
      const samples = JSON.parse(event.data) as TelemetrySample[];
      setSample(samples.find((candidate) => candidate.entityId === deviceId) ?? null);
    };

    const onTelemetry = (event: MessageEvent<string>) => {
      const incoming = JSON.parse(event.data) as TelemetrySample;
      if (incoming.entityId === deviceId) setSample(incoming);
    };

    stream.addEventListener('snapshot', onSnapshot as EventListener);
    stream.addEventListener('telemetry', onTelemetry as EventListener);

    return () => stream.close();
  }, [deviceId]);

  return sample;
}

function HistoryMetric({
  label,
  unit,
  decimals = 2,
  metricKey,
  points,
}: Readonly<{
  label: string;
  unit: string;
  decimals?: number;
  metricKey: HistoryMetricKey;
  points: readonly TelemetryHistoryPoint[];
}>) {
  const values = points.flatMap((point, index) => {
    const value = point[metricKey];
    return value === null ? [] : [{ index, value }];
  });
  const latest = values.at(-1)?.value;

  if (values.length < 2) {
    return (
      <div className="zip-bdfb-history-metric">
        <span>{label}</span>
        <strong>{metric(latest, unit, decimals)}</strong>
        <small>Not enough samples for trend</small>
      </div>
    );
  }

  const min = Math.min(...values.map((entry) => entry.value));
  const max = Math.max(...values.map((entry) => entry.value));
  const range = max - min || 1;
  const width = 180;
  const height = 48;
  const path = values
    .map((entry, position) => {
      const x = values.length === 1 ? width / 2 : (position / (values.length - 1)) * width;
      const y = height - ((entry.value - min) / range) * (height - 8) - 4;
      return `${position === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <div className="zip-bdfb-history-metric">
      <span>{label}</span>
      <strong>{metric(latest, unit, decimals)}</strong>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} historical trend`}>
        <path d={path} />
      </svg>
      <small>
        {metric(min, unit, decimals)} – {metric(max, unit, decimals)}
      </small>
    </div>
  );
}

function HistoricalTelemetry({
  history,
  loading,
  error,
}: Readonly<{
  history: TelemetryHistoryResponse | null;
  loading: boolean;
  error: string | null;
}>) {
  if (loading) return <div className="zip-bdfb-history-state">Loading TimescaleDB history…</div>;
  if (error) return <div className="zip-bdfb-history-state is-error">{error}</div>;
  if (!history?.points.length) {
    return <div className="zip-bdfb-history-state">No historical samples in this window.</div>;
  }

  const latest = history.points.at(-1);

  return (
    <>
      <div className="zip-bdfb-history-grid">
        <HistoryMetric label="VOLTAGE" unit="V" metricKey="voltageV" points={history.points} />
        <HistoryMetric label="CURRENT" unit="A" metricKey="currentA" points={history.points} />
        <HistoryMetric label="POWER" unit="W" metricKey="powerW" points={history.points} />
        <HistoryMetric
          label="ENERGY"
          unit="kWh"
          decimals={4}
          metricKey="energyKwh"
          points={history.points}
        />
      </div>
      <dl className="zip-bdfb-live-average-counts">
        <dt>History scope</dt>
        <dd>{history.scope.label}</dd>
        <dt>Breakers in scope</dt>
        <dd>{history.scope.breakerCount}</dd>
        <dt>Empty positions</dt>
        <dd>{history.scope.emptyPositionCount}</dd>
        <dt>Buckets</dt>
        <dd>{history.points.length}</dd>
        <dt>Latest bucket active</dt>
        <dd>{latest?.activeBreakers ?? 0}</dd>
        <dt>Latest bucket</dt>
        <dd>{compactUtc(latest?.observedAt)}</dd>
      </dl>
    </>
  );
}

export function BdfbTelemetryInspector({
  node,
  presentation,
  activePanelId,
  location,
  feeds,
  mappedBreakerCount = 0,
}: Readonly<{
  node: DeviceNode;
  presentation: BdfbPresentation;
  activePanelId?: string;
  location?: string;
  feeds?: readonly string[];
  mappedBreakerCount?: number;
}>) {
  const telemetry = useTelemetrySample(node.id);
  const [window, setWindow] = useState<InspectorWindow>('LIVE');
  const [history, setHistory] = useState<TelemetryHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const frames = presentation.shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const physicalShelves = presentation.shelves.filter((shelf) => shelf.physical !== false).length;
  const physicalFrames = frames.filter((frame) => frame.physical).length;
  const panelGroups = frames.filter((frame) => !frame.physical).length;
  const selectedPanel = activePanelId
    ? (panels.find((panel) => panel.id === activePanelId) ?? null)
    : null;
  const scopePositions = selectedPanel
    ? selectedPanel.positions
    : panels.flatMap((panel) => panel.positions);
  const aggregate = aggregateBdfbTelemetry(scopePositions, telemetry?.breakerReadings ?? []);

  const hasA = feeds?.includes('A') ?? false;
  const hasB = feeds?.includes('B') ?? false;
  const scopeLabel = selectedPanel?.label ?? 'Entire BDFB';
  const positions = panels.flatMap((panel) => panel.positions);
  const breakers = positions.filter((item) => item !== null);

  useEffect(() => {
    if (window === 'LIVE') return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      deviceId: node.id,
      window,
    });
    if (activePanelId) params.set('panelId', activePanelId);

    void fetch(`/api/telemetry/history?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP_${response.status}`);
        }
        return response.json() as Promise<TelemetryHistoryResponse>;
      })
      .then((payload) => {
        setHistory(payload);
        setHistoryLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHistory(null);
        setHistoryLoading(false);
        setHistoryError(error instanceof Error ? error.message : 'HISTORY_LOAD_FAILED');
      });

    return () => controller.abort();
  }, [activePanelId, node.id, window]);

  return (
    <aside className="telxius-properties zip-bdfb-inspector">
      <header>
        INSPECTOR <span>⌄</span>
      </header>

      <div className="zip-bdfb-inspector-id">
        <span>▥</span>
        <div>
          <h2>{node.name}</h2>
          <small>{location ?? 'Infrastructure'}</small>
        </div>
      </div>

      <section className="zip-bdfb-live-average" aria-label="BDFB telemetry">
        <header>
          <div>
            <i aria-hidden="true" data-live={aggregate.activeBreakers > 0 ? 'true' : 'false'} />
            <strong>{window === 'LIVE' ? 'LIVE AVERAGE' : 'HISTORICAL AVERAGE'}</strong>
          </div>
          <span>{scopeLabel}</span>
        </header>

        <div className="zip-bdfb-window-tabs" role="tablist" aria-label="Telemetry time window">
          <button
            type="button"
            role="tab"
            aria-selected={window === 'LIVE'}
            onClick={() => {
              setHistory(null);
              setHistoryLoading(false);
              setHistoryError(null);
              setWindow('LIVE');
            }}
          >
            LIVE
          </button>
          {TELEMETRY_HISTORY_WINDOWS.map((historyWindow) => (
            <button
              type="button"
              role="tab"
              aria-selected={window === historyWindow}
              key={historyWindow}
              onClick={() => {
                setHistory(null);
                setHistoryLoading(true);
                setHistoryError(null);
                setWindow(historyWindow);
              }}
            >
              {historyWindow.toUpperCase()}
            </button>
          ))}
        </div>

        {window === 'LIVE' ? (
          <>
            <div className="zip-bdfb-live-average-grid">
              <div>
                <span>AVG VOLTAGE</span>
                <strong>{metric(aggregate.averageVoltageV, 'V')}</strong>
              </div>
              <div>
                <span>AVG CURRENT</span>
                <strong>{metric(aggregate.averageCurrentA, 'A')}</strong>
              </div>
              <div>
                <span>AVG POWER</span>
                <strong>{metric(aggregate.averagePowerW, 'W')}</strong>
              </div>
              <div>
                <span>AVG ENERGY</span>
                <strong>{metric(aggregate.averageEnergyKwh, 'kWh', 4)}</strong>
              </div>
            </div>

            <dl className="zip-bdfb-live-average-counts">
              <dt>Active breakers</dt>
              <dd>{aggregate.activeBreakers}</dd>
              <dt>Breakers without live reading</dt>
              <dd>{aggregate.withoutLiveReading}</dd>
              <dt>Empty positions</dt>
              <dd>{aggregate.emptyPositions}</dd>
              <dt>Last packet</dt>
              <dd>{compactUtc(aggregate.latestReceivedAt)}</dd>
            </dl>
          </>
        ) : (
          <HistoricalTelemetry history={history} loading={historyLoading} error={historyError} />
        )}
      </section>

      <dl>
        <dt>Type</dt>
        <dd>BDFB</dd>
        <dt>Location</dt>
        <dd>{location ?? '—'}</dd>
        <dt>Physical shelves</dt>
        <dd>{physicalShelves}</dd>
        <dt>Physical frames</dt>
        <dd>{physicalFrames}</dd>
        <dt>Panel groups</dt>
        <dd>{panelGroups}</dd>
        <dt>Panels</dt>
        <dd>{panels.length}</dd>
        <dt>Breakers</dt>
        <dd>{breakers.length}</dd>
        <dt>Feed A</dt>
        <dd>{hasA ? 'Configured' : '—'}</dd>
        <dt>Feed B</dt>
        <dd>{hasB ? 'Configured' : '—'}</dd>
        <dt>Telemetry</dt>
        <dd>{mappedBreakerCount > 0 ? 'EXPLICIT BINDINGS' : 'UNMAPPED'}</dd>
      </dl>

      <section className="zip-bdfb-status-card">
        <h3>STATUS</h3>
        <div>
          <span>●</span>
          <strong>
            {aggregate.activeBreakers > 0
              ? 'Live breaker telemetry received'
              : 'Physical inventory recorded'}
          </strong>
          <small>
            {aggregate.activeBreakers > 0
              ? `${aggregate.activeBreakers} breaker readings contribute to the current average.`
              : 'Live health requires an explicitly mapped MQTT reading.'}
          </small>
        </div>
      </section>

      <div className="zip-bdfb-actions">
        <span>{mappedBreakerCount} mapped breakers</span>
        <span>
          {selectedPanel
            ? `Average scope: ${selectedPanel.label}`
            : 'Average scope: all configured BDFB breakers'}
        </span>
      </div>
    </aside>
  );
}
