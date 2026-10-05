import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { BdfbService } from '@/modules/power/application/bdfb-service';
import type {
  BdfbBreakerSpec,
  BdfbFrameSpec,
  BdfbPanelSpec,
  BdfbShelfSpec,
  BdfbStructureSpec,
} from '@/modules/power/domain/bdfb-model';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isBreaker(value: unknown): value is BdfbBreakerSpec {
  if (!isRecord(value)) return false;

  const telemetryValid =
    value.telemetry === undefined ||
    (isRecord(value.telemetry) && typeof value.telemetry.rawPointId === 'string');

  return (
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    (value.capacity === undefined || typeof value.capacity === 'number') &&
    telemetryValid
  );
}

function isPanel(value: unknown): value is BdfbPanelSpec {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    Array.isArray(value.positions) &&
    value.positions.every((position) => position === null || isBreaker(position))
  );
}

function isFrame(value: unknown): value is BdfbFrameSpec {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    (value.physicalFrameVisible === undefined || typeof value.physicalFrameVisible === 'boolean') &&
    Array.isArray(value.panels) &&
    value.panels.every(isPanel)
  );
}

function isShelf(value: unknown): value is BdfbShelfSpec {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    Array.isArray(value.frames) &&
    value.frames.every(isFrame)
  );
}

function isBdfbStructure(value: unknown): value is BdfbStructureSpec {
  return isRecord(value) && Array.isArray(value.shelves) && value.shelves.every(isShelf);
}

export async function PUT(request: Request, context: Context) {
  const auth = await requirePermission('power:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);

  if (!isBdfbStructure(body)) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await new BdfbService(await createTopologyRepository()).configure(id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ device: result.value });
}
