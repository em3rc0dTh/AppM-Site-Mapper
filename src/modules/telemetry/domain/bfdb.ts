import type {
  BreakerTelemetryMetrics,
  BreakerTelemetryReading,
  NormalizedTelemetryMessage,
  TelemetryMetricValue,
} from '@/modules/telemetry/domain/entities';
import type {
  BreakerHolder,
  DeviceNode,
  Frame,
  Panel,
  Shelf,
} from '@/modules/topology/domain/entities';

export type BfdbBindingMode = 'panel-order-24' | 'explicit';

export interface BfdbBindingOptions {
  readonly mode: BfdbBindingMode;
  readonly positionsPerPanel: number;
}

interface ResolvedBreaker {
  readonly shelf: Shelf;
  readonly frame: Frame;
  readonly panel: Panel;
  readonly breaker: BreakerHolder;
  readonly position: number;
}

export interface BfdbBreakerBuildResult {
  readonly readings: readonly BreakerTelemetryReading[];
  readonly unmappedPointIds: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function metric(value: unknown, observedAt: string): TelemetryMetricValue | undefined {
  const numeric = finiteNumber(value);
  return numeric === null ? undefined : { value: numeric, observedAt };
}

function explicitMatches(device: DeviceNode, rawPointId: string): ResolvedBreaker[] {
  const matches: ResolvedBreaker[] = [];

  for (const shelf of device.bdfb?.shelves ?? []) {
    for (const frame of shelf.frames) {
      for (const panel of frame.panels) {
        panel.endpoints.forEach((breaker, index) => {
          if (breaker.telemetry?.rawPointId === rawPointId) {
            matches.push({
              shelf,
              frame,
              panel,
              breaker,
              position: index + 1,
            });
          }
        });
      }
    }
  }

  return matches;
}

function panelOrderMatch(
  device: DeviceNode,
  rawPointId: string,
  positionsPerPanel: number,
): ResolvedBreaker | null {
  const match = /^0_([0-9]+)_([0-9]+)$/.exec(rawPointId);
  if (!match) return null;

  const panelIndex = Number(match[1]);
  const position = Number(match[2]);

  if (
    !Number.isInteger(panelIndex) ||
    !Number.isInteger(position) ||
    panelIndex < 1 ||
    position < 1 ||
    position > positionsPerPanel
  ) {
    return null;
  }

  const panels: Array<Readonly<{ shelf: Shelf; frame: Frame; panel: Panel }>> = [];
  for (const shelf of device.bdfb?.shelves ?? []) {
    for (const frame of shelf.frames) {
      for (const panel of frame.panels) {
        panels.push({ shelf, frame, panel });
      }
    }
  }

  const owner = panels[panelIndex - 1];
  const breaker = owner?.panel.endpoints[position - 1];

  if (!owner || !breaker) {
    return null;
  }

  return {
    shelf: owner.shelf,
    frame: owner.frame,
    panel: owner.panel,
    breaker,
    position,
  };
}

export function resolveBfdbBreaker(
  device: DeviceNode,
  rawPointId: string,
  options: BfdbBindingOptions,
): ResolvedBreaker | null {
  const explicit = explicitMatches(device, rawPointId);

  if (explicit.length === 1) {
    return explicit[0] ?? null;
  }

  if (explicit.length > 1 || options.mode === 'explicit') {
    return null;
  }

  return panelOrderMatch(device, rawPointId, options.positionsPerPanel);
}

export function buildBfdbBreakerReadings(
  device: DeviceNode,
  message: NormalizedTelemetryMessage,
  options: BfdbBindingOptions,
): BfdbBreakerBuildResult {
  if (message.protocol !== 'BFDB' || !device.bdfb) {
    return { readings: [], unmappedPointIds: [] };
  }

  const observedAt = message.sourceObservedAt ?? message.receivedAt;
  const readings: BreakerTelemetryReading[] = [];
  const unmappedPointIds: string[] = [];

  for (const [rawPointId, rawPoint] of Object.entries(message.reported)) {
    if (!isRecord(rawPoint)) {
      unmappedPointIds.push(rawPointId);
      continue;
    }

    const resolved = resolveBfdbBreaker(device, rawPointId, options);

    if (!resolved || resolved.breaker.variant !== 'BREAKER') {
      unmappedPointIds.push(rawPointId);
      continue;
    }

    const voltageV = metric(rawPoint.U1, observedAt);
    const currentA = metric(rawPoint.I1, observedAt);
    const powerW = metric(rawPoint.P1, observedAt);
    const energyKwh = metric(rawPoint.EP1, observedAt);

    const metrics: BreakerTelemetryMetrics = {
      ...(voltageV ? { voltageV } : {}),
      ...(currentA ? { currentA } : {}),
      ...(powerW ? { powerW } : {}),
      ...(energyKwh ? { energyKwh } : {}),
    };

    const state =
      rawPoint.state === undefined
        ? undefined
        : {
            value: String(rawPoint.state),
            observedAt,
          };

    readings.push({
      deviceId: device.id,
      sourceIdentity: message.sourceIdentity,
      shelfId: resolved.shelf.id,
      frameId: resolved.frame.id,
      panelId: resolved.panel.id,
      panelLabel: resolved.panel.label,
      breakerId: resolved.breaker.id,
      breakerLabel: resolved.breaker.label,
      rawPointId,
      position: resolved.position,
      metrics,
      ...(state ? { state } : {}),
      receivedAt: message.receivedAt,
    });
  }

  return {
    readings,
    unmappedPointIds,
  };
}
