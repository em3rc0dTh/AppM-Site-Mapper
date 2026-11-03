'use client';

import { useEffect, useMemo, useState } from 'react';

import type { BreakerTelemetryReading, TelemetrySample } from '@/modules/telemetry/domain/entities';

type View = {
  targetId: string;
  status: string;
  sample: TelemetrySample | null;
};

type Metric = {
  label: string;
  value: string;
  unit: string;
};

function metricFromReading(
  reading: BreakerTelemetryReading | undefined,
  key: 'voltageV' | 'currentA' | 'powerW' | 'energyKwh',
): number | undefined {
  return reading?.metrics[key]?.value;
}

function findScalar(
  value: unknown,
  candidates: readonly string[],
  depth = 0,
): { value: number; unit?: string } | null {
  if (depth > 6 || !value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  for (const [key, item] of Object.entries(record)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (candidates.includes(normalized)) {
      if (typeof item === 'number' && Number.isFinite(item)) return { value: item };
      if (item && typeof item === 'object') {
        const nested = item as Record<string, unknown>;
        if (typeof nested.value === 'number' && Number.isFinite(nested.value)) {
          return {
            value: nested.value,
            ...(typeof nested.unit === 'string' ? { unit: nested.unit } : {}),
          };
        }
      }
    }
  }

  for (const item of Object.values(record)) {
    const found = findScalar(item, candidates, depth + 1);
    if (found) return found;
  }
  return null;
}

function metrics(sample: TelemetrySample | null, targetId: string): Metric[] {
  if (!sample) {
    return [
      { label: 'Voltage', value: '—', unit: 'V' },
      { label: 'Current', value: '—', unit: 'A' },
      { label: 'Power', value: '—', unit: 'kW' },
      { label: 'Energy', value: '—', unit: 'kWh' },
    ];
  }

  const reading = sample.breakerReadings?.find((item) => item.breakerId === targetId);
  const voltage =
    metricFromReading(reading, 'voltageV') ??
    findScalar(sample.reported, ['voltage', 'voltagev', 'u', 'v'])?.value;
  const current =
    metricFromReading(reading, 'currentA') ??
    findScalar(sample.reported, ['current', 'currenta', 'i', 'a'])?.value;
  const powerW =
    metricFromReading(reading, 'powerW') ??
    findScalar(sample.reported, ['power', 'powerw', 'p', 'w'])?.value;
  const energy =
    metricFromReading(reading, 'energyKwh') ??
    findScalar(sample.reported, ['energy', 'energykwh', 'e', 'ep', 'kwh'])?.value;

  return [
    { label: 'Voltage', value: voltage === undefined ? '—' : voltage.toFixed(2), unit: 'V' },
    { label: 'Current', value: current === undefined ? '—' : current.toFixed(2), unit: 'A' },
    {
      label: 'Power',
      value: powerW === undefined ? '—' : (powerW / 1000).toFixed(3),
      unit: 'kW',
    },
    { label: 'Energy', value: energy === undefined ? '—' : energy.toFixed(4), unit: 'kWh' },
  ];
}

export function DeclaredPowerTelemetry({
  targetId,
}: Readonly<{
  targetId: string;
}>) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function load() {
      try {
        const response = await fetch(
          `/api/telemetry/entity?${new URLSearchParams({ targetId, window: 'LIVE' })}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) throw new Error('TELEMETRY_UNAVAILABLE');
        const body = (await response.json()) as View;
        if (!controller.signal.aborted) {
          setView(body);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 5000);
      }
    }

    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [targetId]);

  const items = useMemo(() => metrics(view?.sample ?? null, targetId), [view, targetId]);
  const sourceIdentity = view?.sample?.sourceIdentity;
  const receivedAt = view?.sample?.receivedAt;

  return (
    <article
      style={{
        border: '1px solid var(--line, #d6deea)',
        borderRadius: 14,
        padding: 18,
        background: '#fff',
        minWidth: 0,
      }}
    >
      <small>TELEMETRY · BREAKER LIVE</small>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
          marginTop: 12,
        }}
      >
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              border: '1px solid #e4eaf1',
              borderRadius: 10,
              padding: '10px 12px',
              background: '#f8fbff',
            }}
          >
            <small style={{ display: 'block' }}>{item.label}</small>
            <strong style={{ fontSize: 20 }}>
              {item.value} <span style={{ fontSize: 12, fontWeight: 500 }}>{item.unit}</span>
            </strong>
          </div>
        ))}
      </div>
      <small style={{ display: 'block', marginTop: 12 }}>
        {error
          ? 'Telemetry temporarily unavailable'
          : view?.status
            ? `${view.status}${sourceIdentity ? ` · ${sourceIdentity}` : ''}${receivedAt ? ` · ${receivedAt}` : ''}`
            : 'Loading telemetry…'}
      </small>
    </article>
  );
}
