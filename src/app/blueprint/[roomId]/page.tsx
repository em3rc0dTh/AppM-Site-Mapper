import { notFound, redirect } from 'next/navigation';

import { BlueprintCanvas } from '@/components/blueprint/blueprint-canvas';
import { RoomPolygonForm } from '@/components/blueprint/room-polygon-form';
import { TopologyContextTree } from '@/components/topology/context-tree';
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

  const trail = await topology.getTrail(roomId);
  const root = trail[0];
  const tree = root ? await topology.buildNavigationTree(root.id) : null;
  const canWrite = hasPermission(auth.value.role, 'topology:write');

  return (
    <main className="operational-page operational-page--blueprint">
      <div className="operational-layout operational-layout--blueprint">
        <aside className="operational-context">
          {tree && <TopologyContextTree tree={tree} activeId={roomId} />}
        </aside>

        <section className="operational-stage operational-stage--wide">
          <SectionHeader
            eyebrow="SUBSTRUCTURE / ROOM BLUEPRINT"
            title={result.value.room.name.toUpperCase()}
            description="Physical room boundary · cluster bays · 600 × 600 mm position grid"
            actions={<StatusBadge>{canWrite ? 'EDIT PERMITTED' : 'READ ONLY'}</StatusBadge>}
          />

          <div className="operational-stage-body">
            {result.value.room.polygon ? (
              <BlueprintCanvas
                polygon={result.value.room.polygon}
                clusters={result.value.clusters}
                racks={result.value.racks}
                slots={result.value.assignableSlots}
              />
            ) : (
              <StatePanel
                title="No room boundary"
                description="Define the physical boundary to render this room."
              />
            )}
          </div>

          {canWrite && (
            <details className="edit-disclosure operational-blueprint-edit">
              <summary>Edit room boundary</summary>
              <RoomPolygonForm roomId={roomId} />
            </details>
          )}
        </section>
      </div>
    </main>
  );
}
