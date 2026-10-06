import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { BdfbService } from '@/modules/power/application/bdfb-service';
import { canonicalBdfb96Structure } from '@/modules/power/domain/bdfb-model';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ deviceId: string }> }>;

export async function POST(_request: Request, context: Context) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const { deviceId } = await context.params;
  const result = await new BdfbService(await createTopologyRepository()).configure(
    deviceId,
    canonicalBdfb96Structure(),
  );

  if (!result.ok) {
    const status =
      result.error === 'DEVICE_NOT_FOUND'
        ? 404
        : result.error === 'DEVICE_ALREADY_MATERIALIZED'
          ? 409
          : 422;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ device: result.value });
}
