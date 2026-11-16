import { notFound, redirect } from 'next/navigation';

import { BreakerLoadReportWorkbench } from '@/components/workbench/breaker-load-report-workbench';
import { requirePermission } from '@/modules/identity/application/current-session';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const dynamic = 'force-dynamic';

export default async function BreakerReportWorkbenchPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ equipmentId?: string; window?: string }>;
}>) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) redirect('/login');

  const query = await searchParams;
  const equipmentId = query.equipmentId?.trim();
  if (!equipmentId) notFound();

  const repository = await createTopologyRepository();
  const breaker = await repository.getById(equipmentId);
  if (
    breaker?.kind !== 'EQUIPMENT' ||
    breaker.equipmentType !== 'CIRCUIT_BREAKER' ||
    breaker.lifecycle !== 'ACTIVE'
  ) {
    notFound();
  }

  const family = (await repository.listEquipmentForDevice(breaker.deviceId)).filter(
    (item): item is EquipmentNode => item.lifecycle === 'ACTIVE',
  );
  const panel = breaker.parentEquipmentId
    ? family.find((item) => item.id === breaker.parentEquipmentId)
    : undefined;
  const device = await repository.getById(breaker.deviceId);
  const position =
    panel?.childMode === 'POSITIONAL'
      ? panel.children.findIndex((id) => id === breaker.id) + 1
      : null;
  const initialWindow = TELEMETRY_HISTORY_WINDOWS.includes(query.window as TelemetryHistoryWindow)
    ? (query.window as TelemetryHistoryWindow)
    : '24h';

  return (
    <BreakerLoadReportWorkbench
      equipmentId={breaker.id}
      breakerName={breaker.name}
      qdfName={device?.kind === 'DEVICE' ? device.name : breaker.deviceId}
      panelName={panel?.name ?? '—'}
      position={position && position > 0 ? position : null}
      initialWindow={initialWindow}
    />
  );
}
