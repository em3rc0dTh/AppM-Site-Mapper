import { notFound, redirect } from 'next/navigation';

import { QdfLoadReportWorkbench } from '@/components/workbench/qdf-load-report-workbench';
import { requirePermission } from '@/modules/identity/application/current-session';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { TopologyService } from '@/modules/topology/application/topology-service';

export const dynamic = 'force-dynamic';

export default async function LoadReportWorkbenchPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ deviceId?: string; window?: string }>;
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
  const trail = await new TopologyService(repository).getTrail(deviceId);
  const location = trail
    .filter((item) => item.kind === 'SITE' || item.kind === 'STRUCTURE' || item.kind === 'ROOM_SUBSTRUCTURE')
    .map((item) => item.name)
    .join(' / ');
  const initialWindow = TELEMETRY_HISTORY_WINDOWS.includes(query.window as TelemetryHistoryWindow)
    ? (query.window as TelemetryHistoryWindow)
    : '24h';

  return (
    <QdfLoadReportWorkbench
      deviceId={device.id}
      deviceName={device.name}
      location={location}
      initialWindow={initialWindow}
    />
  );
}
