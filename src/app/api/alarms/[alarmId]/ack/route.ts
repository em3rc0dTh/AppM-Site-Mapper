import { requirePermission } from '@/modules/identity/application/current-session';
import { getAlarmSnapshot } from '@/modules/alarms/application/alarm-preview-service';
import { acknowledgePreviewAlarm } from '@/modules/alarms/infrastructure/alarm-preview-runtime';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ alarmId: string }> },
) {
  const auth = await requirePermission('alarms:ack');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const { alarmId } = await params;
  const repository = await createTopologyRepository();
  const snapshot = await getAlarmSnapshot(repository);
  const alarm = snapshot.occurrences.find((item) => item.id === alarmId);

  if (!alarm) return Response.json({ error: 'ALARM_NOT_FOUND' }, { status: 404 });
  if (!alarm.preview) {
    return Response.json({ error: 'PERSISTENT_ACK_NOT_IMPLEMENTED' }, { status: 501 });
  }

  const acknowledgement = acknowledgePreviewAlarm(alarmId);
  return Response.json({
    ok: true,
    alarmId,
    acknowledgedAt: acknowledgement.acknowledgedAt,
    preview: true,
  });
}
