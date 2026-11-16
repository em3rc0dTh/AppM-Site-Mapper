'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DetachedWorkbenchButton } from '@/components/workbench/detached-workbench-button';
import type {
  FullPowerTrace,
  FullPowerTraceLeg,
} from '@/modules/power/application/full-power-trace-service';
import { classifyTelemetryFreshness } from '@/modules/telemetry/domain/telemetry-freshness';

type Feed = 'A' | 'B';
type EffectiveStatus = 'LIVE' | 'STALE' | 'OFFLINE' | 'CLOCK SKEW' | 'MAPPED' | 'UNMAPPED';

function metric(value: number | undefined, unit: string, decimals = 2): string {
  return value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(decimals) + ' ' + unit;
}

function formattedTime(value: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('es-PE');
}

function effectiveStatus(leg: FullPowerTraceLeg | undefined, clock: number): EffectiveStatus {
  if (!leg || leg.telemetry.status === 'UNMAPPED') return 'UNMAPPED';
  if (leg.telemetry.status === 'MAPPED') return 'MAPPED';
  return classifyTelemetryFreshness(leg.telemetry.receivedAt ?? '', undefined, clock);
}

function statusName(status: EffectiveStatus): string {
  switch (status) {
    case 'MAPPED': return 'VINCULADO';
    case 'UNMAPPED': return 'SIN MAPEO';
    case 'CLOCK SKEW': return 'REVISAR RELOJ';
    default: return status;
  }
}

function FeedRoute({
  feed, legs, selectedPathId,
}: Readonly<{ feed: Feed; legs: readonly FullPowerTraceLeg[]; selectedPathId?: string }>) {
  return (
    <section className="sm-trace-feed" data-feed={feed} aria-label={'Ruta del Feed ' + feed}>
      <header className="sm-trace-feed-header">
        <strong>ϟ FEED {feed}</strong>
        <span>{legs.length ? (legs.length === 1 ? 'Ruta registrada' : legs.length + ' rutas registradas') : 'Sin ruta registrada'}</span>
      </header>
      {legs.length === 0 ? (
        <p className="sm-trace-empty">No existe un PowerPath de entrada identificado para Feed {feed}.</p>
      ) : (
        legs.map((leg) => (
          <div
            className="sm-trace-leg"
            data-selected={selectedPathId === leg.pathId}
            key={leg.pathId}
          >
            <ol className="sm-trace-steps">
              <li>
                <small>Origen</small>
                <strong>{leg.source.entityName}</strong>
              </li>
              {leg.source.shelf || leg.source.frame ? (
                <li>
                  <small>Shelf / Frame</small>
                  <strong>{[leg.source.shelf, leg.source.frame].filter(Boolean).join(' / ')}</strong>
                </li>
              ) : null}
              {leg.source.panel ? (
                <li>
                  <small>Panel</small>
                  <strong>{leg.source.panel}</strong>
                </li>
              ) : null}
              <li>
                <small>Breaker</small>
                {leg.source.breakerId ? (
                  <a href={'/device/' + encodeURIComponent(leg.source.breakerId)} target="_blank" rel="noopener noreferrer">
                    {leg.source.breaker ?? leg.source.breakerId}
                  </a>
                ) : (
                  <strong>{leg.source.breaker ?? 'Sin breaker identificado'}</strong>
                )}
              </li>
              <li className="sm-trace-endpoint">
                <small>Conexión física registrada</small>
                <strong>
                  {leg.source.accessPort?.label ?? 'Puerto de salida no identificado'}
                  <span aria-hidden="true"> → </span>
                  {leg.target.accessPort?.label ?? 'Puerto destino no identificado'}
                </strong>
              </li>
            </ol>
            {leg.topologyStatus !== 'VALID' ? (
              <p className="sm-trace-leg-warning">Topología: {leg.topologyStatus.replaceAll('_', ' ')}</p>
            ) : null}
          </div>
        ))
      )}
    </section>
  );
}

function Destination({
  name, kind, feedA, feedB,
}: Readonly<{
  name: string; kind: string;
  feedA: readonly FullPowerTraceLeg[]; feedB: readonly FullPowerTraceLeg[];
}>) {
  const ports = (legs: readonly FullPowerTraceLeg[]) =>
    [...new Set(legs.map((leg) => leg.target.accessPort?.label).filter((value): value is string => Boolean(value)))];
  const a = ports(feedA);
  const b = ports(feedB);
  return (
    <article className="sm-trace-destination">
      <span className="sm-trace-server" aria-hidden="true">▤</span>
      <strong className="sm-trace-destination-name">{name}</strong>
      <small>{kind}</small>
      <div className="sm-trace-destination-ports">
        <div data-feed="A"><b>Entrada A</b><span>{a.length ? a.join(', ') : 'Sin conexión'}</span></div>
        <div data-feed="B"><b>Entrada B</b><span>{b.length ? b.join(', ') : 'Sin conexión'}</span></div>
      </div>
    </article>
  );
}

function FeedTelemetry({
  feed, legs, clock,
}: Readonly<{ feed: Feed; legs: readonly FullPowerTraceLeg[]; clock: number }>) {
  return (
    <section className="sm-trace-telemetry-feed" data-feed={feed}>
      <h3>Feed {feed}</h3>
      {!legs.length ? <p className="sm-trace-empty">Sin ruta asociada.</p> : legs.map((leg) => {
        const status = effectiveStatus(leg, clock);
        return (
          <article className="sm-trace-telemetry-leg" key={leg.pathId}>
            <div className="sm-trace-telemetry-line">
              <strong>{leg.source.breaker ?? leg.source.entityName}</strong>
              <span className="sm-trace-status" data-status={status}>{statusName(status)}</span>
            </div>
            <div className="sm-trace-metrics">
              <div><b>{metric(leg.telemetry.voltageV, 'V')}</b><small>Voltaje</small></div>
              <div><b>{metric(leg.telemetry.currentA, 'A')}</b><small>Corriente</small></div>
              <div><b>{metric(leg.telemetry.powerW, 'W')}</b><small>Potencia</small></div>
              <div><b>{metric(leg.telemetry.energyKwh, 'kWh', 3)}</b><small>Energía</small></div>
            </div>
            <div className="sm-trace-telemetry-meta">
              <span>Última lectura: {formattedTime(leg.telemetry.receivedAt)}</span>
              {leg.telemetry.sourceIdentity ? <span>MQTT: {leg.telemetry.sourceIdentity}</span> : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function comparisonLabel(leg: FullPowerTraceLeg | undefined, value: 'topology' | 'binding' | 'sample', clock: number): string {
  if (!leg) return 'Sin ruta';
  if (value === 'topology') return leg.topologyStatus === 'VALID' ? 'Registrada' : 'Inconsistente';
  if (value === 'binding') return leg.telemetry.status === 'UNMAPPED' ? 'Sin mapeo' : 'Vinculado';
  const status = effectiveStatus(leg, clock);
  return status === 'MAPPED' || status === 'UNMAPPED' ? 'Sin lectura' : statusName(status);
}

function Finding({ children, warning }: Readonly<{ children: ReactNode; warning?: boolean }>) {
  return <li data-warning={warning ? 'true' : 'false'}>{warning ? '⚠ ' : '• '}{children}</li>;
}

export function FullPowerTraceWorkbench({
  entityId, entityName, kind, location, selectedPathId, canReadTelemetry,
}: Readonly<{
  entityId: string; entityName: string; kind: 'DEVICE' | 'EQUIPMENT';
  location: string; selectedPathId?: string; canReadTelemetry: boolean;
}>) {
  const [trace, setTrace] = useState<FullPowerTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [clock, setClock] = useState(0);
  const [graphFeed, setGraphFeed] = useState<Feed>('A');

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/power-trace/' + encodeURIComponent(entityId), {
        cache: 'no-store',
        signal,
      });
      const result = (await response.json()) as { trace?: FullPowerTrace; error?: string };
      if (!response.ok || !result.trace) throw new Error(result.error ?? 'HTTP ' + response.status);
      if (!signal?.aborted) {
        setTrace(result.trace);
        setError('');
        setUpdatedAt(new Date().toISOString());
        setClock(Date.now());
      }
    } catch (cause: unknown) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo actualizar');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const poll = window.setInterval(() => void refresh(controller.signal), 60_000);
    const tick = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => { controller.abort(); window.clearInterval(poll); window.clearInterval(tick); };
  }, [refresh]);

  const feedA = useMemo(() => trace?.feedA ?? [], [trace]);
  const feedB = useMemo(() => trace?.feedB ?? [], [trace]);
  const allLegs = useMemo(() => [...feedA, ...feedB], [feedA, feedB]);
  const primaryA = feedA.find((leg) => leg.pathId === selectedPathId) ?? feedA[0];
  const primaryB = feedB.find((leg) => leg.pathId === selectedPathId) ?? feedB[0];
  const graphLeg = (graphFeed === 'A' ? primaryA : primaryB);
  const graphDeviceId = canReadTelemetry && graphLeg?.source.deviceType === 'BDFB'
    ? graphLeg.source.entityId : undefined;
  const findings = useMemo(() => {
    const messages: string[] = [];
    for (const [feed, legs] of [['A', feedA], ['B', feedB]] as const) {
      if (!legs.length) messages.push('Feed ' + feed + ': no hay PowerPath registrado.');
      for (const leg of legs) {
        if (leg.topologyStatus !== 'VALID') {
          messages.push('Feed ' + feed + ': conexión inconsistente (' + leg.topologyStatus + ').');
        }
        if (!leg.target.accessPort) messages.push('Feed ' + feed + ': falta el puerto de destino.');
        if (canReadTelemetry && leg.telemetry.status === 'UNMAPPED') {
          messages.push('Feed ' + feed + ': breaker sin binding MQTT.');
        }
        const status = effectiveStatus(leg, clock);
        if (canReadTelemetry && ['STALE', 'OFFLINE', 'CLOCK SKEW'].includes(status)) {
          messages.push('Feed ' + feed + ': última telemetría ' + statusName(status) + '.');
        }
      }
    }
    if (trace?.unspecified.length) {
      messages.push(trace.unspecified.length + ' ruta(s) sin clasificación A/B; requieren revisión.');
    }
    if (primaryA && primaryB && primaryA.source.entityId === primaryB.source.entityId) {
      messages.push('Feed A y B comparten el mismo equipo de origen; revisar independencia aguas arriba.');
    }
    return messages;
  }, [feedA, feedB, primaryA, primaryB, trace, clock, canReadTelemetry]);

  return (
    <main className="sm-workbench sm-power-trace-workbench" aria-label="Rastreo de Ruta">
      <header className="sm-trace-header">
        <div className="sm-trace-heading">
          <span className="sm-trace-brand">⬡ <b>Site Mapper MK1</b></span>
          <span className="sm-trace-heading-divider" aria-hidden="true" />
          <h1>ϟ RASTREO DE RUTA</h1>
          <span className="sm-trace-version">Power Trace v2.1</span>
        </div>
        <div className="sm-trace-header-actions">
          <button type="button" onClick={() => void refresh()} disabled={loading && !trace}>Actualizar</button>
          {canReadTelemetry && (primaryA?.source.deviceType === 'BDFB' || primaryB?.source.deviceType === 'BDFB') ? (
            <select aria-label="Feed para gráfica" value={graphFeed} onChange={(e) => setGraphFeed(e.target.value as Feed)}>
              <option value="A">Gráfica A</option><option value="B">Gráfica B</option>
            </select>
          ) : null}
          {graphDeviceId ? (
            <DetachedWorkbenchButton
              href={'/workbench/load-report?deviceId=' + encodeURIComponent(graphDeviceId) + '&window=24h'}
              windowName={'site-mapper-load-report-' + graphDeviceId}
              label="Ver gráfica"
            >Ver gráfica</DetachedWorkbenchButton>
          ) : null}
          <button type="button" onClick={() => window.print()} title="Elegir Guardar como PDF en el diálogo de impresión">Exportar PDF</button>
          <button type="button" onClick={() => window.print()}>Imprimir</button>
        </div>
      </header>

      <section className="sm-trace-summary">
        <div><strong>{entityName}</strong><span>{kind}</span><small>{location || 'Ubicación no disponible'}</small></div>
        <p>{(feedA.length ? 1 : 0) + (feedB.length ? 1 : 0)} / 2 feeds con PowerPath registrado</p>
      </section>

      {error ? <p className="sm-trace-error" role="alert">No se pudo actualizar el rastreo: {error}</p> : null}
      {loading && !trace ? <div className="sm-workbench-empty">Cargando rutas registradas…</div> : null}

      {trace ? (
        <>
          <div className="sm-trace-visual">
            <FeedRoute feed="A" legs={feedA} selectedPathId={selectedPathId} />
            <Destination name={trace.root.name} kind={trace.root.kind} feedA={feedA} feedB={feedB} />
            <FeedRoute feed="B" legs={feedB} selectedPathId={selectedPathId} />
          </div>

          {canReadTelemetry ? (
            <section className="sm-trace-section">
              <header><h2>Telemetría</h2><small>Actualizado: {formattedTime(updatedAt)}</small></header>
              <div className="sm-trace-two-col">
                <FeedTelemetry feed="A" legs={feedA} clock={clock} />
                <FeedTelemetry feed="B" legs={feedB} clock={clock} />
              </div>
            </section>
          ) : null}

          <div className="sm-trace-lower">
            <section className="sm-trace-section">
              <header><h2>Conciliación</h2></header>
              <table className="sm-trace-comparison">
                <thead><tr><th>Referencia</th><th>Feed A</th><th>Feed B</th></tr></thead>
                <tbody>
                  <tr><th>Excel</th><td>Sin referencia vinculada</td><td>Sin referencia vinculada</td></tr>
                  <tr><th>PowerPath</th><td>{comparisonLabel(primaryA, 'topology', clock)}</td><td>{comparisonLabel(primaryB, 'topology', clock)}</td></tr>
                  {canReadTelemetry ? (
                    <>
                      <tr><th>Binding MQTT</th><td>{comparisonLabel(primaryA, 'binding', clock)}</td><td>{comparisonLabel(primaryB, 'binding', clock)}</td></tr>
                      <tr><th>Última lectura</th><td>{formattedTime(primaryA?.telemetry.receivedAt)}</td><td>{formattedTime(primaryB?.telemetry.receivedAt)}</td></tr>
                    </>
                  ) : null}
                </tbody>
              </table>
              <p className="sm-trace-document-note">La coincidencia con Excel sólo se acreditará cuando sus filas estén vinculadas al modelo. No se infiere desde el nombre del breaker.</p>
              {trace.unspecified.length ? <p className="sm-trace-document-note">{trace.unspecified.length} ruta(s) sin Feed A/B no aparecen en las columnas.</p> : null}
            </section>

            <div className="sm-trace-right">
              <section className="sm-trace-section">
                <header><h2>Hallazgos</h2><span>{findings.length}</span></header>
                {findings.length ? (
                  <ul className="sm-trace-findings">
                    {findings.map((finding, index) => <Finding warning key={index}>{finding}</Finding>)}
                  </ul>
                ) : <p className="sm-trace-none">Sin inconsistencias detectadas en las rutas modeladas. No constituye certificación de campo.</p>}
              </section>
              <section className="sm-trace-section sm-trace-actions">
                <header><h2>Acciones</h2></header>
                <div>
                  {[primaryA, primaryB].map((leg, index) => leg?.source.breakerId ? (
                    <a href={'/device/' + encodeURIComponent(leg.source.breakerId)} key={leg.pathId}
                      target="_blank" rel="noopener noreferrer">
                      Abrir {leg.source.breaker ?? 'Breaker ' + (index === 0 ? 'A' : 'B')}
                    </a>
                  ) : null)}
                  {!primaryA?.source.breakerId && !primaryB?.source.breakerId ? (
                    <span>Sin breakers identificados para abrir.</span>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
