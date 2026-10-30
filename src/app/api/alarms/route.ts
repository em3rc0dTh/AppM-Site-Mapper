import { requirePermission } from '@/modules/identity/application/current-session';
import { getAlarmSnapshot } from '@/modules/alarms/application/alarm-preview-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });

  const repository = await createTopologyRepository();
  const snapshot = await getAlarmSnapshot(repository);
  return Response.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
}
