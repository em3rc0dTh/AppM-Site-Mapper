import { SectionHeader, StatePanel, StatusBadge } from '@/shared/ui/primitives';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BlueprintCanvas } from '@/components/blueprint/blueprint-canvas';
import { RoomPolygonForm } from '@/components/blueprint/room-polygon-form';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

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

  const roomLink = await topology.buildDeepLink(roomId);
  const canWrite = hasPermission(auth.value.role, 'topology:write');

  return (
    <main className="workspace-shell">
      <nav className="breadcrumbs">
        <Link href={roomLink}>← {result.value.room.name}</Link>
      </nav>

      <SectionHeader
        eyebrow="Spatial / Blueprint engine"
        title={result.value.room.name}
        description="Physical footprint and rack placement · 600 × 600 mm grid"
        actions={<StatusBadge>{canWrite ? 'EDIT PERMITTED' : 'READ ONLY'}</StatusBadge>}
      />

      {result.value.room.polygon ? (
        <BlueprintCanvas
          polygon={result.value.room.polygon}
          racks={result.value.racks}
          slots={result.value.assignableSlots}
        />
      ) : (
        <StatePanel
          title="No room boundary"
          description="Define the physical boundary to render this room."
        />
      )}

      {canWrite && <RoomPolygonForm roomId={roomId} />}
    </main>
  );
}
