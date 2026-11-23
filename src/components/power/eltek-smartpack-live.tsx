'use client';

import { useEffect, useState } from 'react';

const SOURCE = 'ELTEK-SMARTPACK2-LURIN-REAL';
const OIDS = {
  system: '1.3.6.1.4.1.12148.10.2.1.0',
  current: '1.3.6.1.4.1.12148.10.9.2.5.0',
  battery: '1.3.6.1.4.1.12148.10.10.5.5.0',
} as const;
const SYSTEM_STATUS: Readonly<Record<number, string>> = {
  0: 'Error', 1: 'Normal', 2: 'Alarma menor', 3: 'Alarma mayor',
  4: 'Deshabilitado', 5: 'Desconectado', 6: 'No presente',
  7: 'Alarma menor y mayor', 18: 'Crítico', 19: 'Advertencia',
};
type IndustrialSignal = {
  key: string;
  rawValue: unknown;
  value: number | string | boolean | null;
  quality: string;
  receivedAt: string;
};
type LiveState = {
  signals: IndustrialSignal[];
  receivedAt: number;
};

function readRaw(signal: IndustrialSignal | undefined): string {
  if (!signal) return '—';
  const raw = signal.rawValue ?? signal.value;
  return typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
    ? String(raw) : '—';
}

export function EltekSmartpackLive() {
  const [data, setData] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch(
          '/api/telemetry/industrial/signals?source=' + encodeURIComponent(SOURCE) + '&limit=100',
          { credentials: 'same-origin', cache: 'no-store' },
        );
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const payload = (await response.json()) as { signals?: IndustrialSignal[] };
        if (!Array.isArray(payload.signals)) throw new Error('Respuesta sin señales');
        if (mounted) {
          setData({ signals: payload.signals, receivedAt: Date.now() });
          setNow(Date.now());
          setError(null);
        }
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'No disponible');
      }
    };
    void refresh();
    const polling = setInterval(() => void refresh(), 60_000);
    const clock = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      mounted = false;
      clearInterval(polling);
      clearInterval(clock);
    };
  }, []);

  const find = (oid: string) => data?.signals.find((signal) => signal.key === oid);
  const system = find(OIDS.system);
  const current = find(OIDS.current);
  const battery = find(OIDS.battery);
  const samples = [system, current, battery].filter(
    (signal): signal is IndustrialSignal => Boolean(signal),
  );
  const last = samples.map((signal) => Date.parse(signal.receivedAt))
    .filter(Number.isFinite).reduce((maximum, value) => Math.max(maximum, value), 0);
  const stale = !last || now === null || now - last > 130_000;
  const systemRaw = Number(system?.rawValue ?? system?.value);
  const systemLabel = Number.isInteger(systemRaw)
    ? SYSTEM_STATUS[systemRaw] ?? 'Estado ' + systemRaw
    : '—';

  return (
    <section className="front01-snmp-summary" aria-label="Telemetría general ELTEK SmartPack2 Touch">
      <header className="front01-summary-header">
        <strong>SmartPack2 Touch · SNMP Live</strong>
        <span>{error ? 'ERROR DE LECTURA' : stale ? 'SIN LECTURA RECIENTE' : 'LECTURA RECIENTE'}</span>
      </header>
      <dl className="front01-snmp-kpis">
        <div><dt>Estado general</dt><dd>{system ? systemLabel : '—'}</dd></div>
        <div><dt>Corriente general · RAW</dt><dd>{readRaw(current)}</dd></div>
        <div><dt>Voltaje batería · RAW</dt><dd>{readRaw(battery)}</dd></div>
      </dl>
      <div className="front01-snmp-footer" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <small>Fuente: {SOURCE}</small>
        <small>Captura: polling cada 60 s</small>
        <small>
          Última muestra: {last ? new Date(last).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '—'}
        </small>
        {error ? <small role="alert">Consulta fallida: {error}</small> : null}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.8 }}>
        Valores sin escala comisionada: no representan las entradas independientes A/B del QDF.
        Calidad RAW: {samples.map((item) => item.quality).join(' / ') || 'sin muestras'}.
      </p>
    </section>
  );
}
