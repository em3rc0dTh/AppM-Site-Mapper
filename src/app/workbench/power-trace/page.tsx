import { notFound, redirect } from 'next/navigation';

import { FullPowerTraceWorkbench } from '@/components/workbench/full-power-trace-workbench';
import { hasPermission } from '@/modules/identity/domain/roles';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { TopologyService } from '@/modules/topology/application/topology-service';

export const dynamic = 'force-dynamic';

export default async function PowerTraceWorkbenchPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ entityId?: string; path?: string }>;
}>) {
  const auth = await requirePermission('power:read');
  if (!auth.ok) redirect('/login');

  const query = await searchParams;
  const entityId = query.entityId?.trim();
  if (!entityId) notFound();

  const topology = await createTopologyRepository();
  const entity = await topology.getById(entityId);
  if (
    !entity ||
    (entity.kind !== 'DEVICE' && entity.kind !== 'EQUIPMENT') ||
    entity.lifecycle !== 'ACTIVE'
  ) {
    notFound();
  }

  const trail = await new TopologyService(topology).getTrail(entity.id);
  const location = trail
    .filter((node) => node.id !== entity.id)
    .map((node) => node.name)
    .slice(-5)
    .join(' / ');

  return (
    <FullPowerTraceWorkbench
      entityId={entity.id}
      entityName={entity.name}
      kind={entity.kind}
      location={location}
      selectedPathId={query.path?.trim() || undefined}
      canReadTelemetry={hasPermission(auth.value.role, 'telemetry:read')}
    />
  );
}
