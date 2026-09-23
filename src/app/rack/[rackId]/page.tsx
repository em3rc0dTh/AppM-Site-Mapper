import { notFound, redirect } from 'next/navigation';

import { RackElevation } from '@/components/rack/rack-elevation';
import { requirePermission } from '@/modules/identity/application/current-session';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function RackPage({
  params,
}: Readonly<{ params: Promise<{ rackId: string }> }>) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const { rackId } = await params;
  const service = new RackElevationService(await createTopologyRepository());
  const result = await service.getView(rackId);

  if (!result.ok) {
    notFound();
  }

  return (
    <main className="rack-page">
      <RackElevation view={result.value} />
    </main>
  );
}
