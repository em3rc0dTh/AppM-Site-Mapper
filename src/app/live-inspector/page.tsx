import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LiveMqttInspector } from '@/components/telemetry/live-mqtt-inspector';
import { requirePermission } from '@/modules/identity/application/current-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Live Inspector',
};

export default async function LiveInspectorPage() {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) redirect('/login');

  return <LiveMqttInspector />;
}
