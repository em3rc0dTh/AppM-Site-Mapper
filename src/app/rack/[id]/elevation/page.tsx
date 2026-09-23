import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { RackElevation } from '@/components/rack/rack-elevation';
import { requirePermission } from '@/modules/identity/application/current-session';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function RackElevationPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const { id } = await params;
  const repository = await createTopologyRepository();
  const elevationResult = await new RackElevationService(repository).get(id);

  if (!elevationResult.ok) {
    notFound();
  }

  const topology = new TopologyService(repository);
  const rackLink = await topology.buildDeepLink(id);

  return (
    <main className="workspace-shell">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/network">Network index</Link>
        <Link href={rackLink}>Rack context</Link>
      </nav>
      <RackElevation elevation={elevationResult.value} />
    </main>
  );
}
