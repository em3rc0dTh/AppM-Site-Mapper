'use client';
import { useEffect, useState } from 'react';
import { bdfbSourceView } from '@/modules/telemetry/domain/bdfb-source-view';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

export function useTelemetryStream(enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  const [samples, setSamples] = useState<readonly TelemetrySample[]>([]);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const clock = setInterval(() => setNow(Date.now()), 5000);
    const stream = new EventSource('/api/telemetry/stream');
    const snapshot = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data);
        if (Array.isArray(data)) {
          setSamples(data);
          setHasSnapshot(true);
        }
      } catch {
        setSamples([]);
      }
    };
    const incoming = (event: MessageEvent<string>) => {
      try {
        const sample = JSON.parse(event.data) as TelemetrySample;
        if (typeof sample.targetId === 'string')
          setSamples((previous) => [
            ...previous.filter((item) => item.targetId !== sample.targetId),
            sample,
          ]);
      } catch {
        // Preserve the most recent valid snapshot when one malformed event arrives.
      }
    };
    stream.addEventListener('snapshot', snapshot as EventListener);
    stream.addEventListener('telemetry', incoming as EventListener);
    return () => {
      clearInterval(clock);
      stream.close();
    };
  }, [enabled]);
  return { samples, now, hasSnapshot };
}

export function useBdfbTelemetry(deviceId: string) {
  const { samples, now } = useTelemetryStream();
  return bdfbSourceView(samples, deviceId, now);
}

/** One SSE subscription for the chassis, including independent child Equipment. */
export function useBdfbTelemetrySnapshot(deviceId: string) {
  const { samples, now } = useTelemetryStream();
  return { aggregate: bdfbSourceView(samples, deviceId, now), samples, now };
}
