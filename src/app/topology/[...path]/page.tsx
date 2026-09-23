import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BlueprintCanvas } from '@/components/blueprint/blueprint-canvas';
import { BdfbChassis } from '@/components/power/bdfb-chassis';
import {
  SpatialAuthoringCanvas,
  type SpatialContextPolygon,
  type SpatialNavigationItem,
} from '@/components/spatial/spatial-authoring-canvas';
import { TopologyContextTree, type ContextTreeEntry } from '@/components/topology/context-tree';
import { TopologyCreateForm } from '@/components/topology/topology-create-form';
import {
  TopologyVisualStage,
  type VisualStageChild,
} from '@/components/topology/topology-visual-stage';
import { PinButton } from '@/components/workspace/pin-button';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { allowedChildKinds } from '@/modules/topology/domain/hierarchy';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { topologyInspector } from '@/shared/ui/entity-adapters';
import { InspectButton } from '@/shared/ui/entity-inspector';
import { SectionHeader, StatePanel, StatusBadge } from '@/shared/ui/primitives';

export default async function TopologyNodePage({
  params,
}: Readonly<{ params: Promise<{ path: string[] }> }>) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const { path } = await params;
  const repository = await createTopologyRepository();
  const service = new TopologyService(repository);
  const resolved = await service.resolveDeepLink(path);

  if (!resolved.ok) {
    notFound();
  }

  const node = resolved.value;
  const [trail, children] = await Promise.all([
    service.getTrail(node.id),
    service.listChildren(node.id),
  ]);
  const childKinds = allowedChildKinds(node.kind);
  const canWrite = hasPermission(auth.value.role, 'topology:write');

  const trailEntries: ContextTreeEntry[] = await Promise.all(
    trail.map(async (item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      href: await service.buildDeepLink(item.id),
    })),
  );
  const childEntries: VisualStageChild[] = await Promise.all(
    children.map(async (child) => {
      const deepLink = await service.buildDeepLink(child.id);
      const href =
        child.kind === 'CONTAINER_RACK' && child.variant === 'RACK'
          ? `/rack/${child.id}`
          : deepLink;

      return { node: child, href };
    }),
  );
  const contextChildren: ContextTreeEntry[] = childEntries.map(({ node: child, href }) => ({
    id: child.id,
    name: child.name,
    kind: child.kind,
    href,
  }));

  const structurePreviewNodes =
    node.kind === 'STRUCTURE' && children[0]?.kind === 'LEVEL'
      ? await service.listChildren(children[0].id)
      : [];

  const structurePreviewEntries: VisualStageChild[] = await Promise.all(
    structurePreviewNodes.map(async (child) => ({
      node: child,
      href: await service.buildDeepLink(child.id),
    })),
  );

  const roomLayout =
    node.kind === 'ROOM_SUBSTRUCTURE'
      ? await new SpatialService(repository).getRoomLayout(node.id)
      : null;

  const boundaryContext: SpatialContextPolygon[] =
    node.kind === 'SITE'
      ? childEntries.flatMap(({ node: child, href }) =>
          child.kind === 'STRUCTURE' && child.polygon
            ? [
                {
                  id: child.id,
                  name: child.name,
                  kind: child.kind,
                  polygon: child.polygon,
                  href,
                },
              ]
            : [],
        )
      : node.kind === 'LEVEL'
        ? childEntries.flatMap(({ node: child, href }) =>
            child.kind === 'ROOM_SUBSTRUCTURE' && child.polygon
              ? [
                  {
                    id: child.id,
                    name: child.name,
                    kind: child.kind,
                    polygon: child.polygon,
                    href,
                  },
                ]
              : [],
          )
        : [];

  const spatialNavigationItems: SpatialNavigationItem[] =
    node.kind === 'SITE' || node.kind === 'STRUCTURE' || node.kind === 'LEVEL'
      ? childEntries.map(({ node: child, href }) => ({
          id: child.id,
          name: child.name,
          kind: child.kind,
          href,
        }))
      : [];

  const rackLink =
    node.kind === 'CONTAINER_RACK' && node.variant === 'RACK' ? `/rack/${node.id}` : null;
  const blueprintLink = node.kind === 'ROOM_SUBSTRUCTURE' ? `/blueprint/${node.id}` : null;

  return (
    <main className="operational-page">
      <nav className="breadcrumbs operational-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/network">Network index</Link>
        {trailEntries.map((item) => (
          <Link key={item.id} href={item.href}>
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="operational-layout">
        <aside className="operational-context">
          <TopologyContextTree trail={trailEntries} descendants={contextChildren} />
        </aside>

        <section className="operational-stage">
          <SectionHeader
            eyebrow={node.kind.replaceAll('_', ' ')}
            title={node.name}
            description="Navigate physically, inspect contextually, and keep the canonical hierarchy visible."
            actions={
              <>
                <StatusBadge>{node.lifecycle}</StatusBadge>
                <InspectButton entity={topologyInspector(node)} />
                {(node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') && canWrite && (
                  <PinButton id={node.id} initialPinned={node.pinned} />
                )}
              </>
            }
          />

          <div className="operational-stage-body">
            {node.kind === 'DEVICE' && node.bdfb ? (
              <BdfbChassis device={node} />
            ) : node.kind === 'ROOM_SUBSTRUCTURE' && roomLayout?.ok ? (
              roomLayout.value.room.polygon || canWrite ? (
                <BlueprintCanvas
                  roomId={node.id}
                  roomName={node.name}
                  polygon={roomLayout.value.room.polygon ?? []}
                  clusters={roomLayout.value.clusters}
                  positions={roomLayout.value.positions}
                  racks={roomLayout.value.racks}
                  slots={roomLayout.value.assignableSlots}
                  canEditBoundary={canWrite}
                />
              ) : (
                <StatePanel
                  title="No room boundary"
                  description="This room has no spatial boundary and your role is read-only."
                  kind="readonly"
                />
              )
            ) : node.kind === 'LEVEL' && (boundaryContext.length > 0 || childEntries.length > 0) ? (
              <SpatialAuthoringCanvas
                entityId={node.id}
                entityName={node.name}
                entityKind={node.kind}
                initialPolygon={[]}
                canWrite={false}
                contextPolygons={boundaryContext}
                navigationItems={spatialNavigationItems}
                title="Level floor plan"
                subtitle="Room boundaries · select a room to enter"
              />
            ) : (node.kind === 'SITE' || node.kind === 'STRUCTURE') &&
              (node.polygon || canWrite) ? (
              <SpatialAuthoringCanvas
                entityId={node.id}
                entityName={node.name}
                entityKind={node.kind}
                initialPolygon={node.polygon ?? []}
                canWrite={canWrite}
                contextPolygons={boundaryContext}
                navigationItems={spatialNavigationItems}
                title={node.kind === 'SITE' ? 'Site boundary' : 'Structure boundary'}
                subtitle="Spatial authoring · millimetres"
              />
            ) : (
              <TopologyVisualStage
                node={node}
                items={childEntries}
                previewItems={structurePreviewEntries}
              />
            )}
          </div>

          {canWrite && childKinds.length > 0 && (
            <div className="operational-edit-dock">
              {childKinds.map((kind) => (
                <details className="edit-disclosure" key={kind}>
                  <summary>Edit · Create {kind.replaceAll('_', ' ').toLowerCase()}</summary>
                  <TopologyCreateForm kind={kind} parentId={node.id} />
                </details>
              ))}
            </div>
          )}
        </section>

        <aside className="operational-inspector">
          <div className="operational-inspector-card">
            <span className="eyebrow">Current selection</span>
            <h2>{node.name}</h2>
            <dl>
              <div>
                <dt>Canonical type</dt>
                <dd>{node.kind.replaceAll('_', ' ')}</dd>
              </div>
              <div>
                <dt>Contained</dt>
                <dd>{children.length}</dd>
              </div>
              <div>
                <dt>Lifecycle</dt>
                <dd>{node.lifecycle}</dd>
              </div>
            </dl>
            <div className="operational-inspector-actions">
              <InspectButton label="Technical details" entity={topologyInspector(node)} />
              {rackLink && (
                <Link className="action-link" href={rackLink}>
                  Open rack elevation →
                </Link>
              )}
              {blueprintLink && (
                <Link className="action-link" href={blueprintLink}>
                  Open Blueprint fullscreen →
                </Link>
              )}
            </div>
          </div>
          <div className="operational-hint">
            <span>Navigation contract</span>
            <p>
              The left context grows as you move deeper. The center represents the selected physical
              level; technical facts stay in the inspector.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
