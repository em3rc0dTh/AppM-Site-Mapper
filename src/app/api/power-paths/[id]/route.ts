import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { PowerService } from '@/modules/power/application/power-service';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function DELETE(_request: Request, context: Context) {
  const auth = await requirePermission('power:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { id } = await context.params;
  const service = new PowerService(await createTopologyRepository(), await createPowerRepository());
  const result = await service.archive(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ path: result.value });
}
