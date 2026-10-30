import { redirect } from 'next/navigation';

import { AlarmCenter } from '@/components/alarm/alarm-center';
import { requirePermission } from '@/modules/identity/application/current-session';

export const dynamic = 'force-dynamic';

export default async function AlarmsPage() {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) redirect('/login');
  return (
    <main className="sm-alarm-page">
      <AlarmCenter />
    </main>
  );
}
