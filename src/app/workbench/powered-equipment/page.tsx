import { notFound, redirect } from 'next/navigation';

import { PoweredEquipmentConnectionDiagram } from '@/components/workbench/powered-equipment-connection-diagram';
import { requirePermission } from '@/modules/identity/application/current-session';
import { PoweredEquipmentProjectionService } from '@/modules/power/application/powered-equipment-projection-service';
import { parseDeclaredPowerTarget } from '@/modules/power/domain/powered-equipment';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const dynamic = 'force-dynamic';

export default async function PoweredEquipmentWorkbenchPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ key?: string; target?: string; breakerId?: string }>;
}>) {
  const auth = await requirePermission('power:read');
  if (!auth.ok) redirect('/login');

  const query = await searchParams;
  const explicitKey = query.key?.trim().toLocaleLowerCase();
  const targetKey = query.target ? parseDeclaredPowerTarget(query.target)?.equipmentKey : undefined;
  const breakerId = query.breakerId?.trim();

  const repository = await createTopologyRepository();
  const service = new PoweredEquipmentProjectionService(repository);
  const equipment = breakerId
    ? await service.getByBreakerId(breakerId)
    : explicitKey || targetKey
      ? await service.getByKey(explicitKey || targetKey || '')
      : null;
  if (!equipment) notFound();

  return <PoweredEquipmentConnectionDiagram equipment={equipment} />;
}
