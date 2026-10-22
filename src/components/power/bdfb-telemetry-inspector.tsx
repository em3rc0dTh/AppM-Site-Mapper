'use client';

import { useBdfbTelemetrySnapshot } from '@/components/telemetry/use-bdfb-telemetry';
import { SnmpFeedLoadPanel } from '@/components/power/snmp-feed-load-panel';
import { SnmpFeedHistory } from '@/components/power/snmp-feed-history';
import { SnmpFeedCommissioning } from '@/components/power/snmp-feed-commissioning';

import { useEffect, useRef, useState } from 'react';

import type { BdfbPresentation } from '@/modules/power/domain/bdfb-model';
import { aggregateBdfbDescendantTelemetry } from '@/modules/telemetry/application/bdfb-descendant-telemetry';
import type {
  TelemetryHistoryPoint,
  TelemetryHistoryResponse,
  TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';
import { TELEMETRY_HISTORY_WINDOWS } from '@/modules/telemetry/domain/history';
import type { DeviceNode } from '@/modules/topology/domain/entities';
import { useTranslations } from 'next-intl';

type InspectorTab = 'overview' | 'feeds' | 'history' | 'settings';
const INSPECTOR_TABS: readonly InspectorTab[] = ['overview', 'feeds', 'history', 'settings'];
type HistoryMetricKey = 'voltageV' | 'currentA' | 'powerW' | 'energyKwh';

function metric(value: number | null | undefined, unit: string, decimals = 2): string {
  return value === undefined || value === null ? '—' : `${value.toFixed(decimals)} ${unit}`;
}

function compactUtc(value: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : `${parsed.toISOString().slice(11, 19)} UTC`;
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
  descendantEquipmentIds = [],
}: Readonly<{
  node: DeviceNode;
  presentation: BdfbPresentation;
  activePanelId?: string;
  location?: string;
  feeds?: readonly string[];
  mappedBreakerCount?: number;
  descendantEquipmentIds?: readonly string[];
}>) {
  const t = useTranslations('bdfb.inspector');
  const { samples, now } = useBdfbTelemetrySnapshot(node.id);
  const inspectorRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<InspectorTab>('overview');
  const [window, setWindow] = useState<TelemetryHistoryWindow>('24h');
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
  // Live scope is always the entire canonical BDFB, never only the focused panel.
  const live = aggregateBdfbDescendantTelemetry(samples, descendantEquipmentIds, now);
  const reportingEquipment = live.reportingEquipment;
  const latestReceived = live.latestReceivedAt ?? undefined;

  const hasA = feeds?.includes('A') ?? false;
  const hasB = feeds?.includes('B') ?? false;
  const scopeLabel = selectedPanel?.label ?? 'Entire BDFB';
  const positions = panels.flatMap((panel) => panel.positions);
  const breakers = positions.filter((item) => item !== null);

  useEffect(() => {
    if (tab !== 'history') return;

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
  }, [activePanelId, node.id, tab, window]);

  function changeTab(next: InspectorTab) {
    if (next === tab) return;
    if (next === 'history') {
      setHistory(null);
      setHistoryLoading(true);
      setHistoryError(null);
    }
    setTab(next);
    inspectorRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }

  return (
    <aside ref={inspectorRef} className="telxius-properties zip-bdfb-inspector">
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

      <nav
        className="sm-bdfb-inspector-tabs"
        role="tablist"
        aria-label="BDFB inspector sections"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const current = INSPECTOR_TABS.findIndex((item) => item === tab);
          const nextIndex =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? INSPECTOR_TABS.length - 1
                : (current + (event.key === 'ArrowRight' ? 1 : -1) + INSPECTOR_TABS.length) %
                  INSPECTOR_TABS.length;
          const nextTab = INSPECTOR_TABS[nextIndex]!;
          changeTab(nextTab);
          const button = document.getElementById('sm-bdfb-tab-' + nextTab);
          button?.focus();
        }}
      >
        {INSPECTOR_TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={'sm-bdfb-tab-' + item}
            aria-controls={'sm-bdfb-panel-' + item}
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            onClick={() => changeTab(item)}
          >
            {t(item)}
          </button>
        ))}
      </nav>

      <div
        className="sm-bdfb-inspector-content"
        role="tabpanel"
        id={'sm-bdfb-panel-' + tab}
        aria-labelledby={'sm-bdfb-tab-' + tab}
        tabIndex={0}
      >
        {tab === 'overview' && (
          <>
            <SnmpFeedLoadPanel
              key={node.id}
              deviceId={node.id}
              chassisId={presentation.chassisId}
              view="summary"
            />
            <section
              className="zip-bdfb-live-average"
              aria-label="Live descendant MQTT equipment average"
            >
              <header>
                <div>
                  <i aria-hidden="true" data-live={reportingEquipment > 0 ? 'true' : 'false'} />
                  <strong>DESCENDANT EQUIPMENT · MQTT LIVE</strong>
                </div>
                <span>Entire BDFB</span>
              </header>
              <div className="zip-bdfb-live-average-grid">
                <div>
                  <span>AVG VOLTAGE</span>
                  <strong>{metric(live.averageVoltageV, 'V')}</strong>
                </div>
                <div>
                  <span>AVG CURRENT</span>
                  <strong>{metric(live.averageCurrentA, 'A')}</strong>
                </div>
                <div>
                  <span>AVG POWER</span>
                  <strong>{metric(live.averagePowerW, 'W')}</strong>
                </div>
                <div>
                  <span>AVG ENERGY COUNTER</span>
                  <strong>{metric(live.averageEnergyKwh, 'kWh', 4)}</strong>
                </div>
              </div>

              <p className="zip-bdfb-aggregate-note">
                Live total power: {metric(live.totalPowerW, 'W')}. Mean energy is a
                cumulative-counter average, not consumption over a period.
              </p>
              <dl className="zip-bdfb-live-average-counts">
                <dt>Equipment reporting</dt>
                <dd>{reportingEquipment}</dd>
                <dt>Descendant equipment</dt>
                <dd>{live.descendantEquipment}</dd>
                <dt>Without current reading</dt>
                <dd>{live.withoutCurrentReading}</dd>
                <dt>Last packet</dt>
                <dd>{compactUtc(latestReceived)}</dd>
              </dl>
            </section>
            <section className="zip-bdfb-status-card">
              <h3>STATUS</h3>
              <div>
                <span>●</span>
                <strong>
                  {reportingEquipment > 0
                    ? 'Live descendant equipment telemetry received'
                    : 'Physical inventory recorded'}
                </strong>
                <small>
                  {reportingEquipment > 0
                    ? `${reportingEquipment} descendant Equipment readings contribute to available averages.`
                    : 'Live readings require explicit Equipment MQTT bindings.'}
                </small>
              </div>
            </section>
          </>
        )}

        {tab === 'feeds' && (
          <SnmpFeedLoadPanel
            key={node.id}
            deviceId={node.id}
            chassisId={presentation.chassisId}
            view="feeds"
          />
        )}

        {tab === 'history' && (
          <>
            <SnmpFeedHistory deviceId={node.id} />
            <section
              className="zip-bdfb-live-average"
              aria-label="Historical descendant MQTT equipment averages"
            >
              <header>
                <div>
                  <strong>MQTT · DESCENDANT EQUIPMENT HISTORY</strong>
                </div>
                <span>{scopeLabel}</span>
              </header>
              <div
                className="zip-bdfb-window-tabs"
                role="tablist"
                aria-label="MQTT history time window"
              >
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
              <HistoricalTelemetry
                history={history}
                loading={historyLoading}
                error={historyError}
              />
            </section>
          </>
        )}

        {tab === 'settings' && (
          <>
            <SnmpFeedCommissioning deviceId={node.id} chassisId={presentation.chassisId} />
            <section
              className="sm-bdfb-device-info"
              aria-label="BDFB physical and telemetry properties"
            >
              <h3>INVENTORY & DIAGNOSTICS</h3>
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
            </section>
            <div className="zip-bdfb-actions">
              <span>{mappedBreakerCount} mapped breakers</span>
              <span>
                {selectedPanel
                  ? `Average scope: ${selectedPanel.label}`
                  : 'Average scope: all configured BDFB breakers'}
              </span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
