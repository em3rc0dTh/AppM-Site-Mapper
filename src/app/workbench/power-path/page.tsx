import { notFound, redirect } from 'next/navigation';

import { DetachedPowerPathWorkbench } from '@/components/workbench/detached-power-path-workbench';
import { requirePermission } from '@/modules/identity/application/current-session';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const dynamic = 'force-dynamic';

type CompanionFeed = {
  readonly breakerId: string;
  readonly feed: 'A' | 'B';
  readonly panel: string;
  readonly position: number;
  readonly targetLabel: string;
};

type DeclaredPowerMetadata = {
  readonly feed?: 'A' | 'B';
  readonly companionFeed?: CompanionFeed;
  readonly remarks?: readonly string[];
};

function declaredPowerMetadata(value: unknown): DeclaredPowerMetadata | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const feed = record.feed === 'A' || record.feed === 'B' ? record.feed : undefined;
  const remarks = Array.isArray(record.remarks)
    ? record.remarks.filter((item): item is string => typeof item === 'string')
    : undefined;

  let companionFeed: CompanionFeed | undefined;
  const rawCompanion = record.companionFeed;
  if (rawCompanion && typeof rawCompanion === 'object') {
    const companion = rawCompanion as Record<string, unknown>;
    if (
      typeof companion.breakerId === 'string' &&
      (companion.feed === 'A' || companion.feed === 'B') &&
      typeof companion.panel === 'string' &&
      typeof companion.position === 'number' &&
      typeof companion.targetLabel === 'string'
    ) {
      companionFeed = {
        breakerId: companion.breakerId,
        feed: companion.feed,
        panel: companion.panel,
        position: companion.position,
        targetLabel: companion.targetLabel,
      };
    }
  }

  return {
    ...(feed ? { feed } : {}),
    ...(companionFeed ? { companionFeed } : {}),
    ...(remarks ? { remarks } : {}),
  };
}

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

  const panel = breaker.parentEquipmentId
    ? await repository.getById(breaker.parentEquipmentId)
    : null;

  const device = await repository.getById(breaker.deviceId);

  const metadata = declaredPowerMetadata(breaker.attributes?.declaredPower);
  const normalizedPanel = panel?.kind === 'EQUIPMENT' ? panel.name.trim().toUpperCase() : '';
  const feed: 'A' | 'B' | undefined =
    metadata?.feed ??
    (normalizedPanel.startsWith('A') ? 'A' : normalizedPanel.startsWith('B') ? 'B' : undefined);

  return (
    <DetachedPowerPathWorkbench
      breakerId={breaker.id}
      sourceDevice={device?.kind === 'DEVICE' ? device.name : breaker.deviceId}
      sourcePanel={panel?.kind === 'EQUIPMENT' ? panel.name : 'Panel'}
      sourceBreaker={breaker.name}
      target={target}
      {...(feed ? { feed } : {})}
      {...(metadata?.companionFeed ? { companionFeed: metadata.companionFeed } : {})}
      {...(metadata?.remarks?.length ? { remarks: metadata.remarks } : {})}
    />
  );
}
