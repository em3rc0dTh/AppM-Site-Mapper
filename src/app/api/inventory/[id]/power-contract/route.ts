import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { PowerContractService } from '@/modules/inventory/application/power-contract-service';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import type { AccessPort, PowerRedundancyPolicy } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isAccessPort(value: unknown): value is AccessPort {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    value.kind === 'POWER' &&
    (value.feed === undefined || value.feed === 'A' || value.feed === 'B')
  );
}

export async function PUT(request: Request, context: Context) {
  const auth = await requirePermission('power:write');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (
    !isRecord(body) ||
    !Array.isArray(body.accessPorts) ||
    !body.accessPorts.every(isAccessPort)
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const redundancy: PowerRedundancyPolicy | null =
    body.redundancy === 'NONE' || body.redundancy === 'A_B_REQUIRED' ? body.redundancy : null;
  if (!redundancy) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const { id } = await context.params;
  const topology = await createTopologyRepository();
  const power = await createPowerRepository();
  const current = await topology.getById(id);
  if (!current || (current.kind !== 'DEVICE' && current.kind !== 'EQUIPMENT')) {
    return NextResponse.json({ error: 'ITEM_NOT_FOUND' }, { status: 404 });
  }

  const nextPorts = new Map(body.accessPorts.map((port) => [port.id.trim(), port]));
  const referencedPaths = (await power.listForEntity(id)).filter(
    (path) => path.target.entityId === id && path.target.internal?.accessPortId,
  );

  for (const path of referencedPaths) {
    const portId = path.target.internal?.accessPortId;
    if (!portId) continue;
    const nextPort = nextPorts.get(portId);
    if (!nextPort) {
      return NextResponse.json({ error: 'PORT_IN_USE', pathId: path.id, portId }, { status: 409 });
    }
    if (path.feed && nextPort.feed && path.feed !== nextPort.feed) {
      return NextResponse.json(
        { error: 'PORT_FEED_CONFLICT', pathId: path.id, portId, pathFeed: path.feed },
        { status: 409 },
      );
    }
  }

  const result = await new PowerContractService(topology).update(id, {
    accessPorts: body.accessPorts,
    redundancy,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ item: result.value });
}
