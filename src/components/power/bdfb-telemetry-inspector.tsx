'use client';

import { useBdfbTelemetrySnapshot } from '@/components/telemetry/use-bdfb-telemetry';
import { SnmpFeedLoadPanel } from '@/components/power/snmp-feed-load-panel';
import { SnmpControllerEditor } from '@/components/power/snmp-controller-editor';
import { SnmpTrapPanel } from '@/components/power/snmp-trap-panel';
import { SnmpFeedHistory } from '@/components/power/snmp-feed-history';
import { SnmpFeedCommissioning } from '@/components/power/snmp-feed-commissioning';
import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';
import { DetachedWorkbenchButton } from '@/components/workbench/detached-workbench-button';
import { ThradexAttribution } from '@/shared/ui/thradex-attribution';
import { formatOperationalTimestamp } from '@/shared/time/operational-time';

import Link from 'next/link';
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

type InspectorTab = 'overview' | 'alarms' | 'feeds' | 'history' | 'traps' | 'settings';
const OPERATION_TABS: readonly InspectorTab[] = ['overview', 'feeds', 'history', 'alarms', 'traps'];
const MAINTENANCE_TABS: readonly InspectorTab[] = ['settings'];
type HistoryMetricKey = 'voltageV' | 'currentA' | 'powerW' | 'energyKwh';

function metric(value: number | null | undefined, unit: string, decimals = 2): string {
  return value === undefined || value === null ? '—' : `${value.toFixed(decimals)} ${unit}`;
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

function HistoryMetric({
  label,
  unit,
  decimals = 2,
  scale = 1,
  metricKey,
  points,
}: Readonly<{
  label: string;
  unit: string;
  decimals?: number;
  scale?: number;
  metricKey: HistoryMetricKey;
  points: readonly TelemetryHistoryPoint[];
}>) {
  const ti = useTranslations('bdfb.inspector.info');
  const values = points.flatMap((point, index) => {
    const value = point[metricKey];
    return value === null ? [] : [{ index, value: value * scale }];
  });
  const latest = values.at(-1)?.value;

  if (values.length < 2) {
    return (
      <div className="zip-bdfb-history-metric">
        <span>{label}</span>
        <strong>{metric(latest, unit, decimals)}</strong>
        <small>{ti('smallTrend')}</small>
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
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ti('historicalTrend', { label })}
      >
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
  const ti = useTranslations('bdfb.inspector.info');
  if (loading) return <div className="zip-bdfb-history-state">{ti('loading')}</div>;
  if (error) return <div className="zip-bdfb-history-state is-error">{error}</div>;
  if (!history?.points.length) {
    return <div className="zip-bdfb-history-state">{ti('noSamples')}</div>;
  }

  const latest = history.points.at(-1);

  return (
    <>
      <div className="zip-bdfb-history-grid">
        <HistoryMetric
          label={ti('voltage')}
          unit="V"
          metricKey="voltageV"
          points={history.points}
        />
        <HistoryMetric
          label={ti('current')}
          unit="A"
          metricKey="currentA"
          points={history.points}
        />
        <HistoryMetric
          label={ti('power')}
          unit="kW"
          decimals={3}
          scale={0.001}
          metricKey="powerW"
          points={history.points}
        />
        <HistoryMetric
          label={ti('energy')}
          unit="kWh"
          decimals={4}
          metricKey="energyKwh"
          points={history.points}
        />
      </div>
      <dl className="zip-bdfb-live-average-counts">
        <dt>{ti('historyScope')}</dt>
        <dd>{history.scope.label}</dd>
        <dt>{ti('breakersScope')}</dt>
        <dd>{history.scope.breakerCount}</dd>
        <dt>{ti('emptyPositions')}</dt>
        <dd>{history.scope.emptyPositionCount}</dd>
        <dt>{ti('buckets')}</dt>
        <dd>{history.points.length}</dd>
        <dt>{ti('activeBucket')}</dt>
        <dd>{latest?.activeBreakers ?? 0}</dd>
        <dt>{ti('latestBucket')}</dt>
        <dd>
          <OperationalTime value={latest?.observedAt} />
        </dd>
      </dl>
    </>
  );
}


function BdfbAlarmStrip({ entityId }: Readonly<{ entityId: string }>) {
  const t = useTranslations('alarmUi.scope');
  const { snapshot, error } = useAlarmSnapshot();
  const rollup = snapshot.rollups[entityId];

  if (error) {
    return <div className="front01-alarm-strip is-unavailable">{t('unavailable')}</div>;
  }

  const count = rollup?.activeAlarmCount ?? 0;
  return (
    <div className="front01-alarm-strip" data-severity={rollup?.highestSeverity ?? 'INFO'}>
      <strong>{t('activeCount', { count })}</strong>
      <span>
        {t('severityCounts', {
          critical: rollup?.critical ?? 0,
          warning: rollup?.warning ?? 0,
          info: rollup?.info ?? 0,
        })}
      </span>
    </div>
  );
}

function BdfbAlarmTable({ entityId }: Readonly<{ entityId: string }>) {
  const tc = useTranslations('alarmUi.center');
  const ts = useTranslations('alarmUi.scope');
  const { snapshot, error } = useAlarmSnapshot(true);
  const rollup = snapshot.rollups[entityId];

  if (error) {
    return <p className="front01-alarm-table-state">{tc('unavailable')}</p>;
  }

  const scopedIds = new Set([
    ...(rollup?.directAlarmIds ?? []),
    ...(rollup?.descendantAlarmIds ?? []),
  ]);
  const alarms = snapshot.occurrences
    .filter((item) => item.lifecycle === 'ACTIVE' && scopedIds.has(item.id))
    .sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));

  const severityLabel = (severity: string) =>
    severity === 'CRITICAL'
      ? tc('critical')
      : severity === 'WARNING'
        ? tc('warning')
        : tc('info');

  return (
    <section className="front01-alarm-table" aria-label={tc('viewLabel')}>
      <header>
        <div>
          <strong>{ts('activeCount', { count: rollup?.activeAlarmCount ?? 0 })}</strong>
          <span>
            {ts('severityCounts', {
              critical: rollup?.critical ?? 0,
              warning: rollup?.warning ?? 0,
              info: rollup?.info ?? 0,
            })}
          </span>
        </div>
      </header>

      {alarms.length === 0 ? (
        <p className="front01-alarm-table-state">{tc('empty')}</p>
      ) : (
        <div className="front01-alarm-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{tc('severityLabel')}</th>
                <th>{tc('alarm')}</th>
                <th>{tc('targetPath')}</th>
                <th>{tc('since')}</th>
                <th>{tc('status')}</th>
              </tr>
            </thead>
            <tbody>
              {alarms.map((alarm) => (
                <tr key={alarm.id}>
                  <td>
                    <span className="front01-alarm-severity" data-severity={alarm.severity}>
                      {severityLabel(alarm.severity)}
                    </span>
                  </td>
                  <td>
                    <Link href={'/alarms/' + encodeURIComponent(alarm.id)}>
                      <strong>{alarm.name}</strong>
                      <small>{alarm.sourceContext}</small>
                    </Link>
                  </td>
                  <td>
                    {alarm.path
                      .map((item) => item.name)
                      .slice(-3)
                      .join(' › ')}
                  </td>
                  <td>
                    <OperationalTime value={alarm.openedAt} />
                  </td>
                  <td>
                    <span className="front01-alarm-state">{tc('active')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
  mode = 'operation',
}: Readonly<{
  node: DeviceNode;
  presentation: BdfbPresentation;
  activePanelId?: string;
  location?: string;
  feeds?: readonly string[];
  mappedBreakerCount?: number;
  descendantEquipmentIds?: readonly string[];
  mode?: 'operation' | 'maintenance';
}>) {
  const ti = useTranslations('bdfb.inspector.info');
  const t = useTranslations('bdfb.inspector');
  const tw = useTranslations('workbench');
  const tf = useTranslations('front01Ui');
  const { samples, now } = useBdfbTelemetrySnapshot(node.id);
  const inspectorRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<InspectorTab>(mode === 'maintenance' ? 'settings' : 'overview');
  const tabs = mode === 'maintenance' ? MAINTENANCE_TABS : OPERATION_TABS;
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
  const scopeLabel = selectedPanel?.label ?? ti('entire');
  const positions = panels.flatMap((panel) => panel.positions);
  const breakers = positions.filter((item) => item !== null);
  const occupiedPanels = panels.filter((panel) => panel.positions.some(Boolean)).length;

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
        {ti('inspectorHeading')} <span>⌄</span>
      </header>

      <div className="zip-bdfb-inspector-id">
        <span>▥</span>
        <div>
          <h2>{node.name}</h2>
          <small>{location ?? ti('infrastructure')}</small>
        </div>
      </div>

      {mode === 'operation' && (
        <nav
          className="sm-bdfb-inspector-tabs"
          role="tablist"
          aria-label={ti('inspectorSections')}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const current = tabs.findIndex((item) => item === tab);
            const nextIndex =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            const nextTab = tabs[nextIndex]!;
            changeTab(nextTab);
            const button = document.getElementById('sm-bdfb-tab-' + nextTab);
            button?.focus();
          }}
        >
          {tabs.map((item) => (
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
              {item === 'traps'
                ? t('traps')
                : item === 'alarms'
                  ? t('alarms')
                  : item === 'feeds'
                    ? t('feeds')
                    : item === 'history'
                      ? t('history')
                      : item === 'overview'
                        ? t('overview')
                        : t('settings')}
            </button>
          ))}
        </nav>
      )}

      <div
        className="sm-bdfb-inspector-content"
        role={mode === 'operation' ? 'tabpanel' : 'region'}
        id={mode === 'operation' ? 'sm-bdfb-panel-' + tab : undefined}
        aria-labelledby={mode === 'operation' ? 'sm-bdfb-tab-' + tab : undefined}
        aria-label={mode === 'maintenance' ? ti('maintenanceLabel') : undefined}
        tabIndex={0}
      >
        {tab === 'overview' && (
          <>
            <BdfbAlarmStrip entityId={node.id} />
            <SnmpFeedLoadPanel
              key={node.id}
              deviceId={node.id}
              chassisId={presentation.chassisId}
              view="summary"
            />

            <div className="front01-operation-sections">
              <section aria-label={tf('occupancy')}>
                <h3>{tf('occupancy')}</h3>
                <dl>
                  <dt>{tf('occupiedPanels')}</dt>
                  <dd>
                    {occupiedPanels} / {panels.length}
                  </dd>
                  <dt>{tf('installedCircuits')}</dt>
                  <dd>
                    {breakers.length} / {positions.length}
                  </dd>
                </dl>
                <div className="front01-occupancy-meter-row">
                  <span>{tf('installedCircuits')}</span>
                  <div
                    className="front01-utilization-meter"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={
                      positions.length > 0 ? Math.round((breakers.length / positions.length) * 100) : 0
                    }
                  >
                    <span
                      style={{
                        width: `${
                          positions.length > 0
                            ? Math.max(0, Math.min(100, (breakers.length / positions.length) * 100))
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <b>
                    {positions.length > 0
                      ? `${((breakers.length / positions.length) * 100).toFixed(2)} %`
                      : '—'}
                  </b>
                </div>
              </section>

              <section aria-label={ti('descendantMqttLive')}>
                <h3>{ti('descendantMqttLive')}</h3>
                <dl>
                  <dt>{ti('reportingShort')}</dt>
                  <dd>
                    {reportingEquipment} / {live.descendantEquipment}
                  </dd>
                  <dt>{ti('latestPacket')}</dt>
                  <dd>
                    <OperationalTime value={latestReceived} />
                  </dd>
                  <dt>{ti('totalPower')}</dt>
                  <dd>{metric(kilowatts(live.totalPowerW), 'kW', 3)}</dd>
                </dl>
                <p className="front01-operation-monitor-note">
                  {reportingEquipment > 0
                    ? ti('liveContributors', { count: reportingEquipment })
                    : ti('noActiveDescendantTelemetry')}
                </p>
              </section>
            </div>
          </>
        )}

        {tab === 'alarms' && <BdfbAlarmTable entityId={node.id} />}

        {tab === 'traps' && (
          <SnmpTrapPanel key={node.id} deviceId={node.id} deviceName={node.name} />
        )}

        {tab === 'feeds' && (
          <>
            <div className="sm-detached-workbench-actions">
              <DetachedWorkbenchButton
                href={`/workbench/telemetry?deviceId=${encodeURIComponent(node.id)}&view=inputs`}
                windowName={`site-mapper-telemetry-${node.id}`}
                label={tw('openInputs')}
              />
            </div>
            <SnmpFeedLoadPanel
              key={node.id}
              deviceId={node.id}
              chassisId={presentation.chassisId}
              view="feeds"
            />
          </>
        )}

        {tab === 'history' && (
          <>
            <div className="sm-detached-workbench-actions sm-detached-workbench-actions--split">
              <DetachedWorkbenchButton
                href={`/workbench/telemetry?deviceId=${encodeURIComponent(node.id)}&view=snmp`}
                windowName={`site-mapper-telemetry-${node.id}`}
                label={tw('openSnmpCharts')}
              />
              <DetachedWorkbenchButton
                href={`/workbench/telemetry?deviceId=${encodeURIComponent(node.id)}&view=mqtt`}
                windowName={`site-mapper-telemetry-${node.id}`}
                label={tw('openMqttCharts')}
              />
            </div>
            <SnmpFeedHistory deviceId={node.id} />
            <section className="zip-bdfb-live-average" aria-label={ti('historyChart')}>
              <header>
                <div>
                  <strong>{ti('mqttHistory')}</strong>
                </div>
                <span>{scopeLabel}</span>
              </header>
              <div className="zip-bdfb-window-tabs" role="tablist" aria-label={ti('historyWindow')}>
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
            <SnmpControllerEditor deviceId={node.id} />
            <section className="sm-bdfb-device-info" aria-label={ti('properties')}>
              <h3>{ti('diagnostics')}</h3>
              <dl>
                <dt>{ti('type')}</dt>
                <dd>BDFB</dd>
                <dt>{ti('location')}</dt>
                <dd>{location ?? '—'}</dd>
                <dt>{ti('shelves')}</dt>
                <dd>{physicalShelves}</dd>
                <dt>{ti('frames')}</dt>
                <dd>{physicalFrames}</dd>
                <dt>{ti('groups')}</dt>
                <dd>{panelGroups}</dd>
                <dt>{ti('panels')}</dt>
                <dd>{panels.length}</dd>
                <dt>{ti('breakers')}</dt>
                <dd>{breakers.length}</dd>
                <dt>{ti('feedA')}</dt>
                <dd>{hasA ? ti('configured') : '—'}</dd>
                <dt>{ti('feedB')}</dt>
                <dd>{hasB ? ti('configured') : '—'}</dd>
                <dt>{ti('telemetry')}</dt>
                <dd>{mappedBreakerCount > 0 ? ti('mapped') : ti('unmapped')}</dd>
              </dl>
            </section>
            <div className="zip-bdfb-actions">
              <span>{ti('mappedBreakers', { count: mappedBreakerCount })}</span>
              <span>
                {selectedPanel
                  ? ti('panelScope', { panel: selectedPanel.label })
                  : ti('entireScope')}
              </span>
            </div>
          </>
        )}
      </div>
      <ThradexAttribution variant="inspector" />
    </aside>
  );
}
