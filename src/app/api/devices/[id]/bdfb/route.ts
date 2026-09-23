import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { BdfbService } from '@/modules/power/application/bdfb-service';
import type {
  BdfbStructure,
  BreakerHolder,
  Frame,
  Panel,
  Shelf,
} from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isEndpoint(value: unknown): value is BreakerHolder {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    (value.variant === 'BREAKER' || value.variant === 'HOLDER') &&
    typeof value.label === 'string' &&
    (value.capacity === undefined || typeof value.capacity === 'number')
  );
}

function isPanel(value: unknown): value is Panel {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    Array.isArray(value.endpoints) &&
    value.endpoints.every(isEndpoint)
  );
}

function isFrame(value: unknown): value is Frame {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    Array.isArray(value.panels) &&
    value.panels.every(isPanel)
  );
}

function isShelf(value: unknown): value is Shelf {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    Array.isArray(value.frames) &&
    value.frames.every(isFrame)
  );
}

function isBdfbStructure(value: unknown): value is BdfbStructure {
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
