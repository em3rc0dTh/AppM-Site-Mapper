import { NextRequest } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryResponse,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isWindow(value: string | null): value is TelemetryHistoryWindow {
  return Boolean(value && TELEMETRY_HISTORY_WINDOWS.includes(value as TelemetryHistoryWindow));
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });

  const deviceId = request.nextUrl.searchParams.get('deviceId')?.trim();
  const panelId = request.nextUrl.searchParams.get('panelId')?.trim() || undefined;
  const window = request.nextUrl.searchParams.get('window');

  if (!deviceId || !isWindow(window)) {
    return Response.json({ error: 'INVALID_HISTORY_REQUEST' }, { status: 400 });
  }

  const repository = await createTopologyRepository();
  const node = await repository.getById(deviceId);

  if (!node || node.lifecycle !== 'ACTIVE' || node.kind !== 'DEVICE' || !node.bdfb) {
    return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
  }

  const sourceIdentity = node.serialNumber?.trim();
  if (!sourceIdentity) {
    return Response.json({ error: 'HISTORY_SOURCE_UNAVAILABLE' }, { status: 409 });
  }

  const panels = node.bdfb.shelves.flatMap((shelf) =>
    shelf.frames.flatMap((frame) => frame.panels),
  );
  const selectedPanel = panelId ? panels.find((panel) => panel.id === panelId) : undefined;

  if (panelId && !selectedPanel) {
    return Response.json({ error: 'PANEL_NOT_FOUND' }, { status: 404 });
  }

  const scopedEndpoints = selectedPanel
    ? selectedPanel.endpoints
    : panels.flatMap((panel) => panel.endpoints);
  const breakerEndpoints = scopedEndpoints.filter((endpoint) => endpoint.variant === 'BREAKER');
  const rawPointIds = breakerEndpoints.flatMap((endpoint) =>
    endpoint.telemetry?.rawPointId ? [endpoint.telemetry.rawPointId] : [],
  );

  if (!rawPointIds.length) {
    return Response.json({ error: 'NO_HISTORY_BINDINGS' }, { status: 409 });
  }

  const historyBase = (process.env.TELEMETRY_HISTORY_URL || 'http://127.0.0.1:18080').replace(
    /\/$/,
    '',
  );
  const upstream = new URL(`${historyBase}/history`);
  upstream.searchParams.set('serial', sourceIdentity);
  upstream.searchParams.set('window', window);
  for (const rawPointId of rawPointIds) upstream.searchParams.append('rawPointId', rawPointId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(upstream, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      return Response.json(
        { error: 'HISTORY_PROVIDER_ERROR', upstreamStatus: response.status },
        { status: 502 },
      );
    }

    const body = (await response.json()) as {
      points?: TelemetryHistoryResponse['points'];
    };

    const payload: TelemetryHistoryResponse = {
      deviceId: node.id,
      sourceIdentity,
      scope: {
        kind: selectedPanel ? 'PANEL' : 'BDFB',
        label: selectedPanel?.label ?? node.name,
        ...(selectedPanel ? { panelId: selectedPanel.id } : {}),
        breakerCount: breakerEndpoints.length,
        holderCount: scopedEndpoints.filter((endpoint) => endpoint.variant === 'HOLDER').length,
      },
      window,
      points: Array.isArray(body.points) ? body.points : [],
    };

    return Response.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return Response.json(
      {
        error: 'HISTORY_PROVIDER_UNAVAILABLE',
        detail: error instanceof Error ? error.name : 'unknown',
      },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
