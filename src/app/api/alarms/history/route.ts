import { NextResponse } from 'next/server';

import { AlarmService } from '@/modules/alarm/application/alarm-service';
import { parseHistoryCursor } from '@/modules/alarm/application/alarm-history';
import type { AlarmHistoryQuery } from '@/modules/alarm/application/alarm-history';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createAlarmRepository } from '@/modules/alarm/infrastructure/alarm-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export async function GET(request: Request) {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get('limit') ?? 50);
  const lifecycle = params.get('lifecycle');
  const acknowledgement = params.get('ack');
  const severity = params.get('severity');
  const fromDate = params.get('fromDate');
  const toDate = params.get('toDate');
  const targetId = params.get('targetId')?.trim();
  const cursor = params.get('cursor');
  const isDay = (date: string | null) =>
    !date ||
    (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + 'T00:00:00.000Z')));
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (lifecycle && lifecycle !== 'ACTIVE' && lifecycle !== 'RESOLVED') ||
    (acknowledgement &&
      acknowledgement !== 'ACKNOWLEDGED' &&
      acknowledgement !== 'UNACKNOWLEDGED') ||
    (severity && severity !== 'INFO' && severity !== 'WARNING' && severity !== 'CRITICAL') ||
    !isDay(fromDate) ||
    !isDay(toDate) ||
    (fromDate && toDate && fromDate > toDate) ||
    (targetId && targetId.length > 128)
  ) {
    return NextResponse.json({ error: 'INVALID_HISTORY_FILTERS' }, { status: 400 });
  }
  if (cursor) {
    try {
      parseHistoryCursor(cursor);
    } catch {
      return NextResponse.json({ error: 'INVALID_HISTORY_CURSOR' }, { status: 400 });
    }
  }
  const query: AlarmHistoryQuery = {
    limit,
    ...(lifecycle ? { lifecycle: lifecycle as NonNullable<AlarmHistoryQuery['lifecycle']> } : {}),
    ...(acknowledgement
      ? { acknowledgement: acknowledgement as NonNullable<AlarmHistoryQuery['acknowledgement']> }
      : {}),
    ...(severity ? { severity: severity as NonNullable<AlarmHistoryQuery['severity']> } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    ...(targetId ? { targetId } : {}),
    ...(cursor ? { cursor } : {}),
  };
  const service = new AlarmService(await createAlarmRepository(), await createTopologyRepository());
  return NextResponse.json(await service.history(query));
}
