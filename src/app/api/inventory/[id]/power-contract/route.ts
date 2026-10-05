import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import {
  PowerContractService,
  type PowerContractPortInput,
  type PowerRedundancyPolicy,
} from '@/modules/inventory/application/power-contract-service';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isPort(value: unknown): value is PowerContractPortInput {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    (value.feed === undefined || value.feed === 'A' || value.feed === 'B')
  );
}

export async function PUT(request: Request, context: Context) {
  const auth = await requirePermission('power:write');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || !Array.isArray(body.accessPorts) || !body.accessPorts.every(isPort)) {
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
  const service = new PowerContractService(topology);
  const current = await service.get(id);
  if (!current.ok) {
    return NextResponse.json({ error: current.error }, { status: 404 });
  }

  const nextPorts = new Map(body.accessPorts.map((port) => [port.id.trim(), port]));
  for (const existing of current.value.accessPorts) {
    const referencedPaths = await power.listForAccessPort(existing.id);
    const targetPaths = referencedPaths.filter((path) => path.targetAccessPortId === existing.id);
    if (!targetPaths.length) continue;

    const nextPort = nextPorts.get(existing.id);
    if (!nextPort) {
      return NextResponse.json(
        { error: 'PORT_IN_USE', pathId: targetPaths[0]?.id, portId: existing.id },
        { status: 409 },
      );
    }

    for (const path of targetPaths) {
      if (path.feed && nextPort.feed && path.feed !== nextPort.feed) {
        return NextResponse.json(
          {
            error: 'PORT_FEED_CONFLICT',
            pathId: path.id,
            portId: existing.id,
            pathFeed: path.feed,
          },
          { status: 409 },
        );
      }
    }
  }

  const result = await service.update(id, {
    accessPorts: body.accessPorts,
    redundancy,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ item: result.value });
}
