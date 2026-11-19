'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  BreakerTelemetryReading,
  TelemetrySample,
} from '@/modules/telemetry/domain/entities';

import styles from './live-mqtt-inspector.module.css';

type StreamState = 'connecting' | 'live' | 'reconnecting';
type InspectorMode = 'split' | 'raw' | 'normalized';

function packetScore(sample: TelemetrySample): number {
  const rawKeys = Object.keys(sample.reported);
  const rawWirePoints = rawKeys.filter((key) => /^0_\d+/.test(key)).length;
  return rawWirePoints * 1000 + (sample.breakerReadings?.length ?? 0) * 10 + rawKeys.length;
}

function latestPackets(samples: readonly TelemetrySample[]): TelemetrySample[] {
  const bySource = new Map<string, TelemetrySample>();

  for (const sample of samples) {
    if (sample.protocol !== 'BFDB') continue;
    const previous = bySource.get(sample.sourceIdentity);
    if (!previous) {
      bySource.set(sample.sourceIdentity, sample);
      continue;
    }

    const currentTime = Date.parse(sample.receivedAt);
    const previousTime = Date.parse(previous.receivedAt);
    if (
      currentTime > previousTime ||
      (currentTime === previousTime && packetScore(sample) > packetScore(previous))
    ) {
      bySource.set(sample.sourceIdentity, sample);
    }
  }

  return [...bySource.values()].sort((left, right) =>
    displaySource(left).localeCompare(displaySource(right)),
  );
}

function displaySource(sample: TelemetrySample): string {
  const name = sample.targetName
    ?.replace(/\s*-?\s*CHASSIS\s*$/i, '')
    .replace(/^BDFB\s+/i, '')
    .trim();
  return name || sample.sourceIdentity;
}

function readingMatchesContext(reading: BreakerTelemetryReading, context: string): boolean {
  return [reading.deviceId, reading.shelfId, reading.frameId, reading.panelId, reading.breakerId].some(
    (id) => id && context.includes(id),
  );
}

function sourceMatchesContext(sample: TelemetrySample, context: string): boolean {
  if (!context) return false;
  if (context.includes(sample.targetId) || context.includes(sample.entityId)) return true;
  return (sample.breakerReadings ?? []).some((reading) => readingMatchesContext(reading, context));
}

function panelFromContext(sample: TelemetrySample, context: string): string | null {
  const reading = (sample.breakerReadings ?? []).find((item) =>
    readingMatchesContext(item, context),
  );
  return reading?.panelLabel ?? null;
}

function panelNames(sample: TelemetrySample | null): string[] {
  if (!sample) return [];
  return [
    ...new Set(
      (sample.breakerReadings ?? []).map((reading) => reading.panelLabel).filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function metric(
  metricValue: BreakerTelemetryReading['metrics']['voltageV'],
  unit: string,
  scale = 1,
) {
  if (!metricValue) return null;
  return {
    value: metricValue.value * scale,
    unit,
    observedAt: metricValue.observedAt,
    ...(metricValue.origin ? { origin: metricValue.origin } : {}),
    ...(metricValue.formula ? { formula: metricValue.formula } : {}),
    ...(metricValue.quality ? { quality: metricValue.quality } : {}),
  };
}

function normalizedPayload(
  sample: TelemetrySample | null,
  panel: string,
): Record<string, unknown> | null {
  if (!sample) return null;
  const readings = (sample.breakerReadings ?? []).filter(
    (reading) => panel === 'ALL' || reading.panelLabel === panel,
  );

  return {
    source: {
      name: displaySource(sample),
      sourceIdentity: sample.sourceIdentity,
      targetId: sample.targetId,
      receivedAt: sample.receivedAt,
      ...(sample.messageId ? { messageId: sample.messageId } : {}),
      ...(sample.wireProfile ? { wireProfile: sample.wireProfile } : {}),
    },
    scope: panel,
    positions: readings.map((reading) => ({
      panel: reading.panelLabel,
      position: reading.position,
      breaker: reading.breakerLabel,
      rawPointId: reading.rawPointId,
      voltageV: metric(reading.metrics.voltageV, 'V'),
      currentA: metric(reading.metrics.currentA, 'A'),
      powerKw: metric(reading.metrics.powerW, 'kW', 0.001),
      energyKwh: metric(reading.metrics.energyKwh, 'kWh'),
      ...(reading.state ? { state: reading.state } : {}),
    })),
  };
}

function rawPayload(sample: TelemetrySample | null): Record<string, unknown> | null {
  if (!sample) return null;
  return {
    topic: sample.topic ?? null,
    sourceIdentity: sample.sourceIdentity,
    ...(sample.messageId ? { messageId: sample.messageId } : {}),
    ...(sample.sourceObservedAt ? { sourceObservedAt: sample.sourceObservedAt } : {}),
    ...(sample.sourceSentAt ? { sourceSentAt: sample.sourceSentAt } : {}),
    receivedAt: sample.receivedAt,
    reported: sample.reported,
  };
}

function ageLabel(receivedAt: string | undefined, now: number): string {
  if (!receivedAt) return '—';
  const received = Date.parse(receivedAt);
  if (!Number.isFinite(received)) return '—';
  const seconds = Math.max(0, (now - received) / 1000);
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
}

function CubeMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 4 56 17v30L32 60 8 47V17Z" />
      <path d="m8 17 24 14 24-14M32 31v29M20 24 43 11M20 24v16l12 8 12-8V24" />
      <path d="M21 25v7m0 0-3 2m3-2 3 1" />
    </svg>
  );
}

export function LiveMqttInspector() {
  const [samples, setSamples] = useState<readonly TelemetrySample[]>([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedPanel, setSelectedPanel] = useState('ALL');
  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const [mode, setMode] = useState<InspectorMode>('split');
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const pausedRef = useRef(false);
  const contextRef = useRef('');

  useEffect(() => {
    contextRef.current = new URLSearchParams(window.location.search).get('from') ?? '';
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    const stream = new EventSource('/api/telemetry/stream');

    const onSnapshot = (event: MessageEvent<string>) => {
      if (pausedRef.current) return;
      try {
        const data = JSON.parse(event.data) as TelemetrySample[];
        if (Array.isArray(data)) {
          setSamples(data);
          setStreamState('live');
        }
      } catch {
        // Preserve the last valid packet.
      }
    };

    const onTelemetry = (event: MessageEvent<string>) => {
      if (pausedRef.current) return;
      try {
        const sample = JSON.parse(event.data) as TelemetrySample;
        setSamples((previous) => [
          ...previous.filter(
            (item) =>
              !(
                item.targetType === sample.targetType &&
                item.targetId === sample.targetId &&
                item.sourceIdentity === sample.sourceIdentity &&
                item.sourcePointId === sample.sourcePointId &&
                item.bindingId === sample.bindingId
              ),
          ),
          sample,
        ]);
        setStreamState('live');
      } catch {
        // Preserve the last valid packet.
      }
    };

    stream.addEventListener('snapshot', onSnapshot as EventListener);
    stream.addEventListener('telemetry', onTelemetry as EventListener);
    stream.onerror = () => setStreamState('reconnecting');

    return () => stream.close();
  }, []);

  const packets = useMemo(() => latestPackets(samples), [samples]);

  useEffect(() => {
    if (!packets.length) return;

    const current = packets.find((packet) => packet.sourceIdentity === selectedSource);
    if (current) return;

    const contextual =
      packets.find((packet) => sourceMatchesContext(packet, contextRef.current)) ?? packets[0];
    if (!contextual) return;

    setSelectedSource(contextual.sourceIdentity);
    setSelectedPanel(panelFromContext(contextual, contextRef.current) ?? 'ALL');
  }, [packets, selectedSource]);

  const packet =
    packets.find((candidate) => candidate.sourceIdentity === selectedSource) ?? packets[0] ?? null;
  const panels = panelNames(packet);
  const effectiveSelectedPanel =
    selectedPanel === 'ALL' || panels.includes(selectedPanel) ? selectedPanel : 'ALL';

  const raw = useMemo(() => rawPayload(packet), [packet]);
  const normalized = useMemo(
    () => normalizedPayload(packet, effectiveSelectedPanel),
    [packet, effectiveSelectedPanel],
  );

  async function copy(value: unknown) {
    if (!value) return;
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
  }

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <CubeMark />
          <span className={styles.divider} aria-hidden="true" />
          <h1><span>Live</span> Inspector</h1>
        </div>

        <div className={styles.liveArea}>
          <span
            className={[
              styles.liveBadge,
              streamState === 'live' ? styles.liveBadgeOk : styles.liveBadgeWarn,
            ].join(' ')}
          >
            <i aria-hidden="true" />
            {paused ? 'PAUSED' : streamState === 'live' ? 'LIVE' : streamState.toUpperCase()}
          </span>
          <label className={styles.toggle}>
            <span>Actualización automática</span>
            <input
              type="checkbox"
              checked={!paused}
              onChange={(event) => setPaused(!event.target.checked)}
            />
            <b aria-hidden="true" />
          </label>
        </div>
      </header>

      <section className={styles.toolbar} aria-label="Live inspector scope">
        <label>
          <span>Fuente</span>
          <select
            value={packet?.sourceIdentity ?? ''}
            onChange={(event) => {
              setSelectedSource(event.target.value);
              setSelectedPanel('ALL');
            }}
          >
            {packets.map((candidate) => (
              <option key={candidate.sourceIdentity} value={candidate.sourceIdentity}>
                {displaySource(candidate)} · {candidate.sourceIdentity}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Alcance</span>
          <select value={effectiveSelectedPanel} onChange={(event) => setSelectedPanel(event.target.value)}>
            <option value="ALL">ALL</option>
            {panels.map((panel) => (
              <option key={panel} value={panel}>{panel}</option>
            ))}
          </select>
        </label>

        <div className={styles.packetMeta}>
          <div>
            <span>Último paquete</span>
            <strong>{packet?.receivedAt ? new Date(packet.receivedAt).toLocaleString() : '—'}</strong>
          </div>
          <div>
            <span>Hace</span>
            <strong className={styles.fresh}>{ageLabel(packet?.receivedAt, now)}</strong>
          </div>
          <div>
            <span>Mensaje</span>
            <strong>{packet?.messageId ?? '—'}</strong>
          </div>
          <div>
            <span>Wire profile</span>
            <strong>{packet?.wireProfile ?? '—'}</strong>
          </div>
        </div>
      </section>

      <nav className={styles.tabs} aria-label="Inspector view">
        <button
          className={mode === 'raw' ? styles.activeTab : ''}
          onClick={() => setMode('raw')}
        >
          RAW MQTT
        </button>
        <button
          className={mode === 'normalized' ? styles.activeTab : ''}
          onClick={() => setMode('normalized')}
        >
          NORMALIZADO
        </button>
        <button
          className={mode === 'split' ? styles.activeTab : ''}
          onClick={() => setMode('split')}
        >
          VISTA DIVIDIDA
        </button>
      </nav>

      {!packet ? (
        <section className={styles.empty}>
          <strong>{streamState === 'reconnecting' ? 'Reconectando telemetría…' : 'Esperando MQTT…'}</strong>
          <span>El inspector mostrará el último paquete BFDB aceptado por Site Mapper.</span>
        </section>
      ) : (
        <section
          className={[
            styles.content,
            mode === 'split' ? styles.split : styles.single,
          ].join(' ')}
        >
          {mode !== 'normalized' ? (
            <article className={styles.panel}>
              <header>
                <div>
                  <span className={styles.panelGlyph} aria-hidden="true">⌁</span>
                  <div>
                    <strong>Paquete MQTT recibido</strong>
                    <small>{packet.topic ?? 'topic no disponible'}</small>
                  </div>
                </div>
                <button onClick={() => void copy(raw)}>Copiar</button>
              </header>
              <pre>{JSON.stringify(raw, null, 2)}</pre>
            </article>
          ) : null}

          {mode !== 'raw' ? (
            <article className={styles.panel}>
              <header>
                <div>
                  <span className={styles.panelGlyph} aria-hidden="true">◇</span>
                  <div>
                    <strong>Site Mapper · transformación</strong>
                    <small>V/A fuente · kW/kWh derivados por Site Mapper</small>
                  </div>
                </div>
                <button onClick={() => void copy(normalized)}>Copiar</button>
              </header>
              <pre>{JSON.stringify(normalized, null, 2)}</pre>
            </article>
          ) : null}
        </section>
      )}

      <footer className={styles.footer}>
        <div className={styles.rules}>
          <span><b>V</b> fuente primaria</span>
          <span><b>A</b> fuente primaria</span>
          <span><b>kW</b> derivado V × A</span>
          <span><b>kWh</b> energía derivada Site Mapper</span>
        </div>
        <button className={styles.pause} onClick={() => setPaused((value) => !value)}>
          {paused ? '▶ Reanudar' : 'Ⅱ Pausar'}
        </button>
      </footer>
    </main>
  );
}
