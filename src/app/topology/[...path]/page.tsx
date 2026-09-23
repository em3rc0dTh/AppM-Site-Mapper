import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StructureStudio } from '@/components/topology/structure-studio';
import { BlueprintCanvas } from '@/components/blueprint/blueprint-canvas';
import { DevicePhysicalView, type ElectricalConnection } from '@/components/inventory/device-physical-view';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
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
  params, searchParams,
}: Readonly<{ params: Promise<{ path: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
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
  const query = await searchParams;
  const focus = Object.fromEntries(['shelf', 'panel', 'endpoint', 'path'].flatMap(key => typeof query[key] === 'string' ? [[key, query[key]]] : []));
  const powerReadable = hasPermission(auth.value.role, 'power:read');
  const physicalHref = await service.buildDeepLink(node.id);
  const parent = node.parentId ? await repository.getById(node.parentId) : null;
  const connections: ElectricalConnection[] = (node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') && powerReadable
    ? await Promise.all((await (await createPowerRepository()).listActive()).filter(item => item.source.entityId === node.id || item.target.entityId === node.id).map(async path => {
      const source = await repository.getById(path.source.entityId);
      const target = await repository.getById(path.target.entityId);
      const internal = path.source.internal;
      const shelf = source?.kind === 'DEVICE' ? source.bdfb?.shelves.find(item => item.id === internal?.shelfId) : undefined;
      const frame = shelf?.frames.find(item => item.id === internal?.frameId);
      const panel = frame?.panels.find(item => item.id === internal?.panelId);
      const endpoint = panel?.endpoints.find(item => item.id === internal?.breakerHolderId);
      const params = new URLSearchParams();
      if (shelf) params.set('shelf', shelf.id);
      if (panel) params.set('panel', panel.id);
      if (endpoint) params.set('endpoint', endpoint.id);
      return { path, sourceName: source?.name ?? 'Unavailable source', targetName: target?.name ?? 'Unavailable destination',
        sourceHref: `${await service.buildDeepLink(path.source.entityId)}?${params}`,
        targetHref: await service.buildDeepLink(path.target.entityId),
        sourceTrail: [source?.name, shelf?.label, frame?.label, panel?.label, endpoint?.label].filter((name): name is string => Boolean(name)) };
    })) : [];
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

  const spatialHrefs = roomLayout?.ok ? Object.fromEntries(await Promise.all([...roomLayout.value.clusters, ...roomLayout.value.positions].map(async item => [item.id, await service.buildDeepLink(item.id)]))) : {};

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
            description="Physical infrastructure workspace"
            actions={
              <>
                <StatusBadge>{node.lifecycle}</StatusBadge>
                <InspectButton entity={topologyInspector(node, physicalHref)} />
                {(node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') && canWrite && (
                  <PinButton id={node.id} initialPinned={node.pinned} />
                )}
              </>
            }
          />

          <div className="operational-stage-body">
            {node.kind === 'DEVICE' || node.kind === 'EQUIPMENT' ? (
              <DevicePhysicalView key={physicalHref + JSON.stringify(focus)} device={node} rack={parent?.kind === 'CONTAINER_RACK' ? parent : null} href={physicalHref} connections={connections} focus={focus} powerReadable={powerReadable} />
            ) : node.kind === 'ROOM_SUBSTRUCTURE' && roomLayout?.ok ? (
              roomLayout.value.room.polygon || canWrite ? (
                <BlueprintCanvas
                  navigationHrefs={spatialHrefs}
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
            ) : node.kind === 'STRUCTURE' ? (
              <StructureStudio node={node} levels={childEntries} canWrite={canWrite} />
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
            ) : node.kind === 'SITE' &&
              (node.polygon || canWrite) ? (
              <SpatialAuthoringCanvas
                entityId={node.id}
                entityName={node.name}
                entityKind={node.kind}
                initialPolygon={node.polygon ?? []}
                canWrite={canWrite}
                contextPolygons={boundaryContext}
                navigationItems={spatialNavigationItems}
                title="Site operations canvas"
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
              <InspectButton label="Technical details" entity={topologyInspector(node, physicalHref)} />
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

        </aside>
      </div>
    </main>
  );
}
