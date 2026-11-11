import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { BreakerLoadReportWorkbench } from '@/components/workbench/breaker-load-report-workbench';
import { requirePermission } from '@/modules/identity/application/current-session';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';
import { TopologyService } from '@/modules/topology/application/topology-service';
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

  const t = await getTranslations('workbench');
  const repository = await createTopologyRepository();
  const breaker = await repository.getById(equipmentId);
  if (
    breaker?.kind !== 'EQUIPMENT' ||
    breaker.equipmentType !== 'CIRCUIT_BREAKER' ||
    breaker.lifecycle !== 'ACTIVE'
  ) {
    notFound();
  }

  const panel = breaker.parentEquipmentId
    ? await repository.getById(breaker.parentEquipmentId)
    : null;
  const position =
    panel?.kind === 'EQUIPMENT' ? panel.children.findIndex((id) => id === breaker.id) + 1 : 0;
  const device = await repository.getById(breaker.deviceId);
  const trail = await new TopologyService(repository).getTrail(breaker.id);
  const location = trail
    .filter(
      (item) =>
        item.kind === 'SITE' || item.kind === 'STRUCTURE' || item.kind === 'ROOM_SUBSTRUCTURE',
    )
    .map((item) => item.name)
    .join(' / ');
  const context = [
    device?.name,
    panel?.kind === 'EQUIPMENT' ? panel.name : null,
    position > 0 ? t('positionShort', { position }) : null,
    location || null,
  ]
    .filter(Boolean)
    .join(' · ');

  const initialWindow = TELEMETRY_HISTORY_WINDOWS.includes(query.window as TelemetryHistoryWindow)
    ? (query.window as TelemetryHistoryWindow)
    : '24h';

  return (
    <BreakerLoadReportWorkbench
      equipmentId={breaker.id}
      equipmentName={breaker.name}
      context={context}
      initialWindow={initialWindow}
    />
  );
}
