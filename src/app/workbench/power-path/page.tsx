import { notFound, redirect } from 'next/navigation';

import { DetachedPowerPathWorkbench } from '@/components/workbench/detached-power-path-workbench';
import { requirePermission } from '@/modules/identity/application/current-session';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const dynamic = 'force-dynamic';

export default async function PowerPathWorkbenchPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ breakerId?: string }>;
}>) {
  const auth = await requirePermission('power:read');
  if (!auth.ok) redirect('/login');

  const query = await searchParams;
  const breakerId = query.breakerId?.trim();
  if (!breakerId) notFound();

  const repository = await createTopologyRepository();
  const breaker = await repository.getById(breakerId);
  if (
    breaker?.kind !== 'EQUIPMENT' ||
    breaker.equipmentType !== 'CIRCUIT_BREAKER' ||
    breaker.lifecycle !== 'ACTIVE'
  ) {
    notFound();
  }

  const target = breaker.aliases?.find((alias) => alias.trim().length > 0);
  if (!target) notFound();

  const panel =
    breaker.parentEquipmentId
      ? await repository.getById(breaker.parentEquipmentId)
      : null;

  const device = await repository.getById(breaker.deviceId);

  const normalizedPanel =
    panel?.kind === 'EQUIPMENT' ? panel.name.trim().toUpperCase() : '';
  const feed: 'A' | 'B' | undefined = normalizedPanel.startsWith('A')
    ? 'A'
    : normalizedPanel.startsWith('B')
      ? 'B'
      : undefined;

  return (
    <DetachedPowerPathWorkbench
      breakerId={breaker.id}
      sourceDevice={device?.kind === 'DEVICE' ? device.name : breaker.deviceId}
      sourcePanel={panel?.kind === 'EQUIPMENT' ? panel.name : 'Panel'}
      sourceBreaker={breaker.name}
      target={target}
      {...(feed ? { feed } : {})}
    />
  );
}
