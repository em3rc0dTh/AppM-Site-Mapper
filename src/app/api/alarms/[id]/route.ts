import { NextResponse } from 'next/server';

import { AlarmService } from '@/modules/alarm/application/alarm-service';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createAlarmRepository } from '@/modules/alarm/infrastructure/alarm-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await params;
  const service = new AlarmService(await createAlarmRepository(), await createTopologyRepository());
  const occurrence = await service.getOccurrenceView(id);
  if (!occurrence) return NextResponse.json({ error: 'ALARM_NOT_FOUND' }, { status: 404 });
  return NextResponse.json({
    occurrence,
    transitions: await service.transitions(id),
  });
}
