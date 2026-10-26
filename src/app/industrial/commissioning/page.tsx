import { redirect } from 'next/navigation';

import { CommissioningConsole } from '@/components/industrial/commissioning-console';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';

export const dynamic = 'force-dynamic';

export default async function IndustrialCommissioningPage() {
  const auth = await requirePermission('settings:read');
  if (!auth.ok) redirect('/workspace');
  const telemetry = await requirePermission('telemetry:read');
  if (!telemetry.ok) redirect('/workspace');

  return (
    <CommissioningConsole canWrite={
      hasPermission(auth.value.role, 'settings:write') &&
      hasPermission(auth.value.role, 'topology:write')
    } />
  );
}
