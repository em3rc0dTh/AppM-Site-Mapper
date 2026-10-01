import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { PowerContractService } from '@/modules/inventory/application/power-contract-service';
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
  if (!isRecord(body) || !Array.isArray(body.accessPorts) || !body.accessPorts.every(isAccessPort)) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const redundancy: PowerRedundancyPolicy | null =
    body.redundancy === 'NONE' || body.redundancy === 'A_B_REQUIRED'
      ? body.redundancy
      : null;
  if (!redundancy) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await new PowerContractService(await createTopologyRepository()).update(id, {
    accessPorts: body.accessPorts,
    redundancy,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ item: result.value });
}
