import { NextRequest } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { BdfbProjectionService } from '@/modules/power/application/bdfb-projection-service';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryResponse,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTelemetryStoreClient } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isWindow(value: string | null): value is TelemetryHistoryWindow {
  return Boolean(value && TELEMETRY_HISTORY_WINDOWS.includes(value as TelemetryHistoryWindow));
}

function configuredSourceFor(deviceId: string): string | null {
  const raw = process.env.MQTT_SOURCE_DEVICE_MAP?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const match = Object.entries(parsed).find(([, target]) => target === deviceId);
    return match?.[0] ?? null;
  } catch {
    return null;
  }
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
  if (!node || node.lifecycle !== 'ACTIVE' || node.kind !== 'DEVICE') {
    return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
  }

  const presentation = await new BdfbProjectionService(repository).get(node.id);
  if (!presentation) {
    return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
  }

  const bindingRepository = await createTelemetryBindingRepository();
  const sourceBindings = (await bindingRepository.listForTarget('DEVICE', node.id)).filter(
    (binding) => binding.protocol === 'MQTT' && !binding.sourcePointId,
  );
  const sourceIdentity =
    (sourceBindings.length === 1 ? sourceBindings[0]?.sourceIdentity : null) ??
    configuredSourceFor(node.id) ??
    node.serialNumber?.trim() ??
    null;

  if (!sourceIdentity) {
    return Response.json({ error: 'HISTORY_SOURCE_UNAVAILABLE' }, { status: 409 });
  }

  const panels = presentation.shelves.flatMap((shelf) =>
    shelf.frames.flatMap((frame) => frame.panels),
  );
  const selectedPanel = panelId ? panels.find((panel) => panel.id === panelId) : undefined;
  if (panelId && !selectedPanel) {
    return Response.json({ error: 'PANEL_NOT_FOUND' }, { status: 404 });
  }

  const positions = selectedPanel
    ? selectedPanel.positions
    : panels.flatMap((panel) => panel.positions);
  const breakers = positions.filter((item) => item !== null);
  const rawPointIds = breakers.flatMap((breaker) =>
    breaker.rawPointId ? [breaker.rawPointId] : [],
  );

  if (!rawPointIds.length) {
    return Response.json({ error: 'NO_HISTORY_BINDINGS' }, { status: 409 });
  }

  if (process.env.TELEMETRY_HISTORY_ENABLED !== 'true') {
    return Response.json({ error: 'HISTORY_STORE_DISABLED' }, { status: 503 });
  }

  try {
    const points = await createTelemetryStoreClient().query(sourceIdentity, window, rawPointIds);
    const payload: TelemetryHistoryResponse = {
      deviceId: node.id,
      sourceIdentity,
      scope: {
        kind: selectedPanel ? 'PANEL' : 'BDFB',
        label: selectedPanel?.label ?? node.name,
        ...(selectedPanel ? { panelId: selectedPanel.id } : {}),
        breakerCount: breakers.length,
        emptyPositionCount: positions.filter((item) => item === null).length,
      },
      window,
      points,
    };

    return Response.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json(
      {
        error: 'HISTORY_STORE_UNAVAILABLE',
        detail: error instanceof Error ? error.message : 'unknown',
      },
      { status: 503 },
    );
  }
}
