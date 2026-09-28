import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { RackElevation } from '@/components/rack/rack-elevation';
import { requirePermission } from '@/modules/identity/application/current-session';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function RackPage({
  params,
}: Readonly<{ params: Promise<{ rackId: string }> }>) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const { rackId } = await params;
  const repository = await createTopologyRepository();
  const elevation = new RackElevationService(repository);
  const topology = new TopologyService(repository);
  const result = await elevation.getView(rackId);

  if (!result.ok) {
    notFound();
  }

  const [trail, inventoryLinks] = await Promise.all([
    topology.getTrail(rackId),
    Promise.all(
      result.value.inventory.map(async (item) => ({
        id: item.id,
        href: await topology.buildDeepLink(item.id),
      })),
    ),
  ]);

  const trailEntries = await Promise.all(
    trail.map(async (item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      href: await topology.buildDeepLink(item.id),
    })),
  );

  return (
    <main className="operational-page operational-page--rack zip-rack-page">
      <nav
        className="breadcrumbs operational-breadcrumbs telxius-breadcrumbs"
        aria-label="Breadcrumb"
      >
        {trailEntries.map((item) => (
          <Link key={item.id} href={item.href}>
            {item.name}
          </Link>
        ))}
      </nav>

      <RackElevation
        view={result.value}
        context={{
          trail: trailEntries,
          inventoryHrefs: Object.fromEntries(inventoryLinks.map((item) => [item.id, item.href])),
        }}
      />
    </main>
  );
}
