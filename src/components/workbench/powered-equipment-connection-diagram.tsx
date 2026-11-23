'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { resolveBreakerLiveMetrics } from '@/components/telemetry/telemetry-presentation';
import { electricalSummary, summaryValue } from '@/modules/power/application/connection-electrical-summary';
import type {
  PoweredEquipmentConnection,
  PoweredEquipmentProjection,
} from '@/modules/power/application/powered-equipment-projection-service';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

type TelemetryView = {
  readonly targetId: string;
  readonly status: string;
  readonly sample: TelemetrySample | null;
};

type LiveMetrics = {
  readonly status: string;
  readonly receivedAt?: string;
  readonly voltageV?: number;
  readonly currentA?: number;
  readonly powerW?: number;
  readonly energyKwh?: number;
};

type FeedKey = 'A' | 'B' | 'UNSPECIFIED';

function liveMetrics(view: TelemetryView | null, breakerId: string): LiveMetrics {
  return {
    status: view?.status ?? 'NO_DATA',
    ...resolveBreakerLiveMetrics(view?.sample, breakerId),
  };
}

function feedKey(connection: PoweredEquipmentConnection): FeedKey {
  return connection.feed ?? connection.endpoint.side ?? 'UNSPECIFIED';
}

function formatNumber(value: number | undefined, digits: number): string {
  return value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

function qdfGroups(equipment: PoweredEquipmentProjection) {
  return equipment.qdfs.map((qdf) => ({
    qdf,
    connections: equipment.connections.filter((connection) => connection.qdfName === qdf),
  }));
}

function feedConnections(
  connections: readonly PoweredEquipmentConnection[],
  feed: FeedKey,
): readonly PoweredEquipmentConnection[] {
  return connections.filter((connection) => feedKey(connection) === feed);
}

function statusClass(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === 'LIVE' || normalized === 'ONLINE' || normalized === 'REPORTING')
    return 'is-live';
  return 'is-no-data';
}

export function PoweredEquipmentConnectionDiagram({
  equipment,
}: Readonly<{
  equipment: PoweredEquipmentProjection;
}>) {
  const t = useTranslations('pages.power');
  const [telemetry, setTelemetry] = useState<Record<string, LiveMetrics>>({});
  const [selectedAid, setSelectedAid] = useState<string | null>(null);
  const groups = useMemo(() => qdfGroups(equipment), [equipment]);
  const remarkConnections = useMemo(
    () => equipment.connections.filter((connection) => connection.remarks.length),
    [equipment.connections],
  );
  const targetTypeLabel = equipment.kind === 'PDU' ? t('pdu') : t('poweredEquipment');

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const breakerIds = [
      ...new Set(equipment.connections.map((connection) => connection.breakerId)),
    ];

    async function load() {
      const entries = await Promise.all(
        breakerIds.map(async (breakerId) => {
          try {
            const response = await fetch(
              `/api/telemetry/entity?${new URLSearchParams({ targetId: breakerId, window: 'LIVE' })}`,
              { cache: 'no-store', signal: controller.signal },
            );
            if (!response.ok) throw new Error('LIVE_UNAVAILABLE');
            const body = (await response.json()) as TelemetryView;
            return [breakerId, liveMetrics(body, breakerId)] as const;
          } catch {
            return [breakerId, { status: 'NO_DATA' } satisfies LiveMetrics] as const;
          }
        }),
      );
      if (!controller.signal.aborted) {
        setTelemetry(Object.fromEntries(entries));
        timer = setTimeout(load, 5000);
      }
    }

    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [equipment.connections]);

  const aggregate = useMemo(() => {
    const byFeed = (feed: FeedKey) =>
      ({
        feed,
        ...electricalSummary(
          equipment.connections.filter((connection) => feedKey(connection) === feed),
          telemetry,
        ),
      }) as const;
    return [byFeed('A'), byFeed('B'), byFeed('UNSPECIFIED')];
  }, [equipment.connections, telemetry]);

  const overall = useMemo(
    () => electricalSummary(equipment.connections, telemetry),
    [equipment.connections, telemetry],
  );

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    await document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  function renderFeed(connections: readonly PoweredEquipmentConnection[], feed: FeedKey) {
    if (!connections.length) return null;
    const isA = feed === 'A';
    const isB = feed === 'B';
    const label = isA
      ? t('feedSide', { side: 'A' })
      : isB
        ? t('feedSide', { side: 'B' })
        : t('feedUnspecified');
    const partLabel =
      equipment.kind === 'PDU'
        ? label
        : isA
          ? t('poweredPart', { side: 'A' })
          : isB
            ? t('poweredPart', { side: 'B' })
            : t('poweredPartUnspecified');
    const feedClass = isA ? 'is-a' : isB ? 'is-b' : 'is-unspecified';

    return (
      <section className={`sm-powered-feed-layout ${feedClass}`} key={feed}>
        <div className="sm-powered-feed-panel">
          <header>
            <div>
              <strong>{label}</strong>
              <span>{t('breakerCount', { count: connections.length })}</span>
            </div>
          </header>
          <div className="sm-powered-columns" aria-hidden="true">
            <span>{t('breaker')}</span>
            <span>{t('endpoint')}</span>
            <span>{t('nominalCurrent')}</span>
            <span>V</span>
            <span>I</span>
            <span>P</span>
            <span>E</span>
          </div>
          <div className="sm-powered-breaker-rows">
            {connections.map((connection) => {
              const metrics = telemetry[connection.breakerId];
              const selected = selectedAid === connection.endpoint.aid;
              return (
                <button
                  type="button"
                  className={
                    selected ? 'sm-powered-breaker-row is-selected' : 'sm-powered-breaker-row'
                  }
                  key={`${connection.breakerId}-${connection.endpoint.aid}`}
                  onClick={() =>
                    setSelectedAid((current) =>
                      current === connection.endpoint.aid ? null : connection.endpoint.aid,
                    )
                  }
                  title={connection.endpoint.aid}
                >
                  <span className="sm-powered-breaker-name">
                    <i className={statusClass(metrics?.status ?? 'NO_DATA')} aria-hidden="true" />
                    <b>{connection.breakerName}</b>
                  </span>
                  <span>{connection.endpoint.displayLabel}</span>
                  <span className="sm-powered-nominal">
                    {connection.nominalCurrentA === undefined
                      ? '—'
                      : `${formatNumber(connection.nominalCurrentA, 0)} A`}
                  </span>
                  <span>{formatNumber(metrics?.voltageV, 1)}</span>
                  <span>{formatNumber(metrics?.currentA, 2)}</span>
                  <span>
                    {metrics?.powerW === undefined ? '—' : (metrics.powerW / 1000).toFixed(3)}
                  </span>
                  <span>{formatNumber(metrics?.energyKwh, 3)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="sm-powered-wire-panel" aria-hidden="true">
          <div className="sm-powered-wire-spacer" />
          {connections.map((connection) => (
            <div
              className={
                selectedAid === connection.endpoint.aid
                  ? 'sm-powered-wire is-selected'
                  : 'sm-powered-wire'
              }
              key={`wire-${connection.breakerId}-${connection.endpoint.aid}`}
            >
              <span />
            </div>
          ))}
        </div>

        <div className="sm-powered-endpoint-panel">
          <header>
            <strong>{partLabel}</strong>
            <span>{t('declaredEndpoints', { count: connections.length })}</span>
          </header>
          <div className="sm-powered-endpoint-label" aria-hidden="true">
            {t('endpointAid')}
          </div>
          <div className="sm-powered-endpoint-rows">
            {connections.map((connection) => {
              const selected = selectedAid === connection.endpoint.aid;
              return (
                <button
                  type="button"
                  className={
                    selected ? 'sm-powered-endpoint-row is-selected' : 'sm-powered-endpoint-row'
                  }
                  key={`endpoint-${connection.breakerId}-${connection.endpoint.aid}`}
                  onClick={() =>
                    setSelectedAid((current) =>
                      current === connection.endpoint.aid ? null : connection.endpoint.aid,
                    )
                  }
                  title={connection.endpoint.aid}
                >
                  <i aria-hidden="true" />
                  <span>
                    <strong>{connection.endpoint.displayLabel}</strong>
                    <small>{connection.endpoint.aid}</small>
                    {connection.endpoint.localAid !== connection.endpoint.aid ? (
                      <small>
                        {t('localAid')}: {connection.endpoint.localAid}
                      </small>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <main className="sm-workbench sm-powered-equipment-workbench">
      <header className="sm-workbench-header">
        <div>
          <small>{t('detachedTitle')}</small>
          <h1>{t('connectionDiagram')}</h1>
          <p>{t('connectionDiagramSubtitle')}</p>
        </div>
        <div className="sm-workbench-header-actions">
          <button type="button" onClick={() => window.print()}>
            {t('exportDiagram')}
          </button>
          <button type="button" onClick={() => void toggleFullscreen()}>
            {t('fullscreen')}
          </button>
          <button type="button" onClick={() => window.close()}>
            {t('closeConnectionDiagram')}
          </button>
        </div>
      </header>

      <section className="sm-powered-summary-card">
        <div className="sm-powered-equipment-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <h2>{equipment.name}</h2>
          <p>{targetTypeLabel}</p>
        </div>
        <dl>
          <div>
            <dt>{t('declaredEndpointsLabel')}</dt>
            <dd>{equipment.connections.length}</dd>
          </div>
          <div>
            <dt>{t('sourceQdf')}</dt>
            <dd>{equipment.qdfs.join(', ') || '—'}</dd>
          </div>
          <div>
            <dt>{t('rackAid')}</dt>
            <dd>{equipment.rackAids.join(', ') || '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="sm-powered-diagram">
        {groups.map((group) => (
          <article className="sm-powered-source-group" key={group.qdf}>
            <div className="sm-powered-diagram-head">
              <div className="sm-powered-source-title">
                <div className="sm-powered-qdf-icon" aria-hidden="true">
                  ▥
                </div>
                <div>
                  <strong>{group.qdf}</strong>
                  <span>{t('powerSource')}</span>
                </div>
              </div>
              <span aria-hidden="true" />
              <div className="sm-powered-target-title">
                <div className="sm-powered-equipment-icon is-small" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div>
                  <strong>{equipment.name}</strong>
                  <span>{targetTypeLabel}</span>
                </div>
              </div>
            </div>

            {renderFeed(feedConnections(group.connections, 'A'), 'A')}
            {renderFeed(feedConnections(group.connections, 'B'), 'B')}
            {renderFeed(feedConnections(group.connections, 'UNSPECIFIED'), 'UNSPECIFIED')}
          </article>
        ))}
      </section>

      <section className="sm-powered-footer-card sm-powered-electrical-summary">
        <header>
          <h2>{t('electricalSummary')}</h2>
          <span>{t('summaryByFeed')}</span>
        </header>
        <div className="sm-powered-summary-table">
          <div className="is-header">
            <span>{t('feedLabel')}</span>
            <span>{t('summaryVoltage')}</span>
            <span>{t('summaryCurrent')}</span>
            <span>{t('summaryPower')}</span>
            <span>{t('summaryEnergy')}</span>
          </div>
          {aggregate
            .filter((item) => item.breakerCount > 0)
            .map((item) => (
              <div key={item.feed}>
                <b data-feed={item.feed}>{item.feed === 'UNSPECIFIED' ? '—' : item.feed}</b>
                <span>{item.voltage}</span>
                <span>{summaryValue(item.current, item.breakerCount, 2, 'A')}</span>
                <span>{summaryValue(item.power, item.breakerCount, 3, 'kW', 1000)}</span>
                <span>{summaryValue(item.energy, item.breakerCount, 3, 'kWh')}</span>
              </div>
            ))}
          <div className="is-total">
            <b>{t('total')}</b>
            <strong>{overall.voltage}</strong>
            <strong>{summaryValue(overall.current, overall.breakerCount, 2, 'A')}</strong>
            <strong>{summaryValue(overall.power, overall.breakerCount, 3, 'kW', 1000)}</strong>
            <strong>{summaryValue(overall.energy, overall.breakerCount, 3, 'kWh')}</strong>
          </div>
        </div>
        <p>{t('electricalSummaryNote')}</p>
        {selectedAid ? (
          <div className="sm-powered-selection" aria-live="polite">
            <small>{t('selectedEndpoint')}</small>
            <code>{selectedAid}</code>
          </div>
        ) : null}
        {remarkConnections.length ? (
          <div className="sm-powered-documentary-remarks">
            <h3>{t('documentaryRemarks')}</h3>
            <p>{t('documentaryRemarksHelp')}</p>
            <ul>
              {remarkConnections.map((connection) => (
                <li key={`remarks-${connection.breakerId}-${connection.endpoint.aid}`}>
                  <strong>
                    {connection.breakerName} · {connection.endpoint.displayLabel}
                  </strong>
                  {connection.remarks.map((remark) => (
                    <span key={remark}>{remark}</span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </main>
  );
}
