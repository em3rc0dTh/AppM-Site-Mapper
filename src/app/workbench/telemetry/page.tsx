import { notFound, redirect } from 'next/navigation';

import { DetachedTelemetryWorkbench } from '@/components/workbench/detached-telemetry-workbench';
import { requirePermission } from '@/modules/identity/application/current-session';
import { BdfbProjectionService } from '@/modules/power/application/bdfb-projection-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const dynamic = 'force-dynamic';

export default async function TelemetryWorkbenchPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ deviceId?: string; view?: string }>;
}>) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) redirect('/login');
  const query = await searchParams;
  const deviceId = query.deviceId?.trim();
  if (!deviceId) notFound();

  const repository = await createTopologyRepository();
  const device = await repository.getById(deviceId);
  if (device?.kind !== 'DEVICE' || device.deviceType !== 'BDFB' || device.lifecycle !== 'ACTIVE') {
    notFound();
  }
  const presentation = await new BdfbProjectionService(repository).get(deviceId);
  if (!presentation) notFound();

  const initialView =
    query.view === 'mqtt' || query.view === 'inputs' || query.view === 'snmp' ? query.view : 'snmp';

  return (
    <DetachedTelemetryWorkbench
      deviceId={device.id}
      deviceName={device.name}
      chassisId={presentation.chassisId}
      initialView={initialView}
    />
  );
}
