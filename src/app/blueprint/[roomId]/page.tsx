import { notFound, redirect } from 'next/navigation';

import { BlueprintCanvas } from '@/components/blueprint/blueprint-canvas';
import { TopologyContextTree, type ContextTreeEntry } from '@/components/topology/context-tree';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { SectionHeader, StatePanel, StatusBadge } from '@/shared/ui/primitives';

export default async function BlueprintPage({
  params,
}: Readonly<{ params: Promise<{ roomId: string }> }>) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const { roomId } = await params;
  const repository = await createTopologyRepository();
  const topology = new TopologyService(repository);
  const result = await new SpatialService(repository).getRoomLayout(roomId);

  if (!result.ok) {
    notFound();
  }

  const [trail, children] = await Promise.all([
    topology.getTrail(roomId),
    topology.listChildren(roomId),
  ]);
  const trailEntries: ContextTreeEntry[] = await Promise.all(
    trail.map(async (node) => ({
      id: node.id,
      name: node.name,
      kind: node.kind,
      href: await topology.buildDeepLink(node.id),
    })),
  );
  const childEntries: ContextTreeEntry[] = await Promise.all(
    children.map(async (node) => ({
      id: node.id,
      name: node.name,
      kind: node.kind,
      href: await topology.buildDeepLink(node.id),
    })),
  );
  const spatialHrefs = Object.fromEntries(await Promise.all([...result.value.clusters, ...result.value.positions].map(async item => [item.id, await topology.buildDeepLink(item.id)])));
  const canWrite = hasPermission(auth.value.role, 'topology:write');

  return (
    <main className="operational-page operational-page--blueprint">
      <div className="operational-layout operational-layout--blueprint">
        <aside className="operational-context">
          <TopologyContextTree trail={trailEntries} descendants={childEntries} />
        </aside>

        <section className="operational-stage operational-stage--wide">
          <SectionHeader
            eyebrow="Spatial / Blueprint engine"
            title={result.value.room.name}
            description="Physical footprint and rack placement · 600 × 600 mm grid"
            actions={<StatusBadge>{canWrite ? 'EDIT PERMITTED' : 'READ ONLY'}</StatusBadge>}
          />

          <div className="operational-stage-body">
            {result.value.room.polygon || canWrite ? (
              <BlueprintCanvas
                navigationHrefs={spatialHrefs}
                roomId={roomId}
                roomName={result.value.room.name}
                polygon={result.value.room.polygon ?? []}
                clusters={result.value.clusters}
                positions={result.value.positions}
                racks={result.value.racks}
                slots={result.value.assignableSlots}
                canEditBoundary={canWrite}
              />
            ) : (
              <StatePanel
                title="No room boundary"
                description="This room has no spatial boundary and your role is read-only."
                kind="readonly"
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
