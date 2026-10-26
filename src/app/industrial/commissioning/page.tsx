import { redirect } from 'next/navigation';

import { CommissioningConsole } from '@/components/industrial/commissioning-console';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';

export const dynamic = 'force-dynamic';

export default async function IndustrialCommissioningPage({
  searchParams,
}: {
  searchParams: Promise<{ deviceId?: string }>;
}) {
  const auth = await requirePermission('settings:read');
  if (!auth.ok) redirect('/workspace');
  const telemetry = await requirePermission('telemetry:read');
  if (!telemetry.ok) redirect('/workspace');

  const query = await searchParams;
  const initialDeviceId =
    typeof query.deviceId === 'string' && query.deviceId.length <= 160 ? query.deviceId : undefined;

  return (
    <CommissioningConsole initialDeviceId={initialDeviceId} canWrite={
      hasPermission(auth.value.role, 'settings:write') &&
      hasPermission(auth.value.role, 'topology:write')
    } />
  );
}
