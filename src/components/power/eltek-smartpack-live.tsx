'use client';

import { useEffect, useState } from 'react';
import {
  ELTEK_SMARTPACK_OIDS,
  ELTEK_SMARTPACK_SOURCE,
  presentEltekReading,
  type EltekSignal,
} from '@/modules/telemetry/application/eltek-live-presentation';

const FIELDS = [
  { key: 'system', label: 'Estado general' },
  { key: 'current', label: 'Corriente general · RAW (sin unidad verificada)' },
  { key: 'battery', label: 'Voltaje batería · RAW (sin unidad verificada)' },
] as const;

export function EltekSmartpackLive() {
  const [signals, setSignals] = useState<EltekSignal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch(
          '/api/telemetry/industrial/signals?source=' + encodeURIComponent(ELTEK_SMARTPACK_SOURCE) + '&limit=100',
          { credentials: 'same-origin', cache: 'no-store' },
        );
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const payload = (await response.json()) as { signals?: EltekSignal[] };
        if (!Array.isArray(payload.signals)) throw new Error('Respuesta sin señales');
        if (mounted) {
          setSignals(payload.signals);
          setNow(Date.now());
          setError(null);
        }
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'No disponible');
      }
    };
    void refresh();
    const poll = setInterval(() => void refresh(), 60_000);
    const clock = setInterval(() => setNow(Date.now()), 10_000);
    return () => { mounted = false; clearInterval(poll); clearInterval(clock); };
  }, []);

  const readings = now === null ? [] : FIELDS.map(({ key, label }) => ({
    key, label, reading: presentEltekReading(
      signals.find((signal) => signal.key === ELTEK_SMARTPACK_OIDS[key]), now, key,
    ),
  }));
  const recent = readings.length === FIELDS.length &&
    readings.every(({ reading }) => reading.state === 'RECENT');

  return (
    <section className="front01-snmp-summary" aria-label="Telemetría general ELTEK SmartPack2 Touch">
      <header className="front01-summary-header">
        <strong>SmartPack2 Touch · SNMP Live</strong>
        <span>{error ? 'ERROR DE CONSULTA' : recent ? 'MUESTRAS RECIENTES' : 'DATOS INCOMPLETOS O ANTIGUOS'}</span>
      </header>
      <dl className="front01-snmp-kpis">
        {readings.map(({ key, label, reading }) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{reading.state === 'RECENT' ? reading.text : '—'}</dd>
            <small>
              {reading.state} · {reading.quality} · RAW: {reading.raw}
              {' · '}{reading.receivedAt
                ? new Date(reading.receivedAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })
                : 'Sin fecha válida'}
            </small>
          </div>
        ))}
      </dl>
      <div className="front01-snmp-footer">
        <small>Fuente: {ELTEK_SMARTPACK_SOURCE} · Consulta cada 60 s</small>
        {error ? <small role="alert">Consulta fallida: {error}</small> : null}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.8 }}>
        Valores crudos de controlador, no representan entradas independientes A/B ni lecturas normalizadas.
      </p>
    </section>
  );
}
