import { redirect } from 'next/navigation';

import { LiveTelemetry } from '@/components/telemetry/live-telemetry';
import { requirePermission } from '@/modules/identity/application/current-session';

export const dynamic = 'force-dynamic';

export default async function TelemetryPage() {
  const auth = await requirePermission('telemetry:read');

  if (!auth.ok) {
    redirect('/login');
  }

  return <LiveTelemetry />;
}
