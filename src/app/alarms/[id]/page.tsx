import { redirect } from 'next/navigation';

import { AlarmDetail } from '@/components/alarm/alarm-detail';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';

export const dynamic = 'force-dynamic';

export default async function AlarmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) redirect('/login');
  const { id } = await params;
  return (
    <main className="sm-alarm-page">
      <AlarmDetail id={id} canAck={hasPermission(auth.value.role, 'alarms:ack')} />
    </main>
  );
}
