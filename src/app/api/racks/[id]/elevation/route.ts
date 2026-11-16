import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(_request: Request, context: Context) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await new RackElevationService(await createTopologyRepository()).getView(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result.value);
}
