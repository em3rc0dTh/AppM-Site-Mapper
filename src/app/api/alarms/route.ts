import { NextResponse } from 'next/server';

import { AlarmService } from '@/modules/alarm/application/alarm-service';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createAlarmRepository } from '@/modules/alarm/infrastructure/alarm-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export async function GET(request: Request) {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const url = new URL(request.url);
  const includeResolved = url.searchParams.get('includeResolved') === 'true';
  const service = new AlarmService(
    await createAlarmRepository(),
    await createTopologyRepository(),
  );
  return NextResponse.json(
    await service.snapshot({
      includeResolved,
      resolvedLimit: 100,
    }),
  );
}
