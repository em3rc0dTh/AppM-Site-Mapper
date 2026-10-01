import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { FullPowerTraceService } from '@/modules/power/application/full-power-trace-service';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ entityId: string }> }>;

export async function GET(_request: Request, context: Context) {
  const auth = await requirePermission('power:read');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { entityId } = await context.params;
  const [topology, power, telemetry] = await Promise.all([
    createTopologyRepository(),
    createPowerRepository(),
    getTelemetryRuntime(),
  ]);

  const trace = await new FullPowerTraceService(topology, power, telemetry.service).resolve(entityId);
  if (!trace) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json({ trace });
}
