import { NextResponse } from 'next/server';

import { AlarmService } from '@/modules/alarm/application/alarm-service';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createAlarmRepository } from '@/modules/alarm/infrastructure/alarm-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { isSafeMutationRequest } from '@/shared/http/request-security';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('alarms:ack');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  if (!isSafeMutationRequest(request)) {
    return NextResponse.json({ error: 'CROSS_SITE_MUTATION_REJECTED' }, { status: 403 });
  }

  const { id } = await params;
  const service = new AlarmService(
    await createAlarmRepository(),
    await createTopologyRepository(),
  );
  try {
    return NextResponse.json({
      occurrence: await service.acknowledge(id, auth.value.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ALARM_ACK_FAILED';
    const status = message === 'ALARM_NOT_FOUND' ? 404 : message === 'ALARM_NOT_ACTIVE' ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
