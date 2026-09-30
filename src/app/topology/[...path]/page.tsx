import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BlueprintCanvas } from '@/components/blueprint/blueprint-canvas';
import { BdfbChassis, type BreakerPowerBinding } from '@/components/power/bdfb-chassis';
import { BdfbPowerTree } from '@/components/power/bdfb-power-tree';
import { TopologyContextTree } from '@/components/topology/context-tree';
import { TopologyCreateForm } from '@/components/topology/topology-create-form';
import { TopologyPropertiesPanel } from '@/components/topology/topology-properties-panel';
import {
  TopologyVisualStage,
  type VisualStageChild,
} from '@/components/topology/topology-visual-stage';
import { PinButton } from '@/components/workspace/pin-button';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { hasPermission } from '@/modules/identity/domain/roles';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { allowedChildKinds } from '@/modules/topology/domain/hierarchy';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { topologyInspector } from '@/shared/ui/entity-adapters';
import { InspectButton } from '@/shared/ui/entity-inspector';
import { SectionHeader, StatePanel, StatusBadge } from '@/shared/ui/primitives';

function eyebrowFor(node: TopologyNode): string {
  switch (node.kind) {
    case 'SITE':
      return 'INFRASTRUCTURE / SITE CANVAS';
    case 'STRUCTURE':
      return 'BUILDING / STRUCTURE LAYOUT';
    case 'LEVEL':
      return 'LEVEL / FLOOR LAYOUT';
    case 'ROOM_SUBSTRUCTURE':
      return 'SUBSTRUCTURE / ROOM BLUEPRINT';
    case 'DEVICE':
      return node.bdfb ? 'POWER / BDFB INTERNALS' : 'DEVICE';
    default:
      return node.kind.replaceAll('_', ' ');
  }
}

function navigationContextRoot(
  trail: readonly TopologyNode[],
  node: TopologyNode,
): TopologyNode | null {
  const byKind = (kind: TopologyNode['kind']) =>
    [...trail].reverse().find((candidate) => candidate.kind === kind) ?? null;

  switch (node.kind) {
    case 'ROOM_SUBSTRUCTURE':
      return byKind('LEVEL') ?? trail[0] ?? null;
    case 'CONTAINER_CLUSTER_BAY':
    case 'POSITION':
      return byKind('ROOM_SUBSTRUCTURE') ?? trail[0] ?? null;
    case 'CONTAINER_RACK':
      return byKind('ROOM_SUBSTRUCTURE') ?? trail[0] ?? null;
    case 'DEVICE':
    case 'EQUIPMENT':
      return (
        byKind('ROOM_SUBSTRUCTURE') ?? byKind('LEVEL') ?? byKind('POSITION') ?? trail[0] ?? null
      );
    default:
      return trail[0] ?? null;
  }
}

function descriptionFor(node: TopologyNode): string | undefined {
  switch (node.kind) {
    case 'SITE':
      return node.kind;
    case 'STRUCTURE':
      return undefined;
    case 'ROOM_SUBSTRUCTURE':
      return 'Physical room boundary · cluster bays · 600 × 600 mm position grid';
    case 'DEVICE':
      return node.bdfb ? 'Physical distribution hierarchy · live MQTT overlay' : undefined;
    default:
      return undefined;
  }
}

export default async function TopologyNodePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ level?: string; panel?: string; breaker?: string }>;
}>) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const [{ path }, query] = await Promise.all([params, searchParams]);
  const repository = await createTopologyRepository();
  const service = new TopologyService(repository);
  const resolved = await service.resolveDeepLink(path);

  if (!resolved.ok) {
    notFound();
  }

  const node = resolved.value;
  function openRoom(candidate: TopologyNode): void {
    if (candidate.kind === 'ROOM_SUBSTRUCTURE') redirect(`/blueprint/${candidate.id}`);
  }
  openRoom(node);
  if (node.kind === 'CONTAINER_RACK') redirect(`/rack/${node.id}`);
  if ((node.kind === 'DEVICE' && !node.bdfb) || node.kind === 'EQUIPMENT')
    redirect(`/device/${node.id}`);
  const [trail, children, selfHref] = await Promise.all([
    service.getTrail(node.id),
    service.listChildren(node.id),
    service.buildDeepLink(node.id),
  ]);
  const root = navigationContextRoot(trail, node);
  const navigationTree = root ? await service.buildNavigationTree(root.id) : null;
  const trailEntries = await Promise.all(
    trail.map(async (item) => ({
      id: item.id,
      name: item.name,
      href: await service.buildDeepLink(item.id),
    })),
  );
  const childKinds = allowedChildKinds(node.kind);
  const canWrite = hasPermission(auth.value.role, 'topology:write');

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

  const levels = children.filter((child) => child.kind === 'LEVEL');
  const selectedLevel =
    node.kind === 'STRUCTURE'
      ? (levels.find((level) => level.id === query.level) ?? levels[0] ?? null)
      : null;

  const structurePreviewNodes =
    selectedLevel?.kind === 'LEVEL' ? await service.listChildren(selectedLevel.id) : [];

  const structurePreviewEntries: VisualStageChild[] = await Promise.all(
    structurePreviewNodes.map(async (child) => ({
      node: child,
      href: await service.buildDeepLink(child.id),
    })),
  );

  const structureLevelEntries: VisualStageChild[] =
    node.kind === 'STRUCTURE'
      ? levels.map((level) => ({
          node: level,
          href: childEntries.find((entry) => entry.node.id === level.id)!.href,
        }))
      : [];

  const roomLayout =
    node.kind === 'ROOM_SUBSTRUCTURE'
      ? await new SpatialService(repository).getRoomLayout(node.id)
      : null;

  const bdfbPowerBindings: BreakerPowerBinding[] = [];
  if (node.kind === 'DEVICE' && node.bdfb) {
    const activePaths = await (await createPowerRepository()).listActive();
    for (const path of activePaths) {
      const deviceEndpoint =
        path.source.entityId === node.id
          ? path.source
          : path.target.entityId === node.id
            ? path.target
            : null;
      const counterpart =
        path.source.entityId === node.id
          ? path.target
          : path.target.entityId === node.id
            ? path.source
            : null;
      const breakerId = deviceEndpoint?.internal?.breakerHolderId;
      if (!breakerId || !counterpart) continue;
      const counterpartNode = await repository.getById(counterpart.entityId);
      const counterpartTrail = counterpartNode ? await service.getTrail(counterpart.entityId) : [];
      const counterpartRack = [...counterpartTrail]
        .reverse()
        .find((item) => item.kind === 'CONTAINER_RACK');
      const allocation =
        counterpartRack?.kind === 'CONTAINER_RACK'
          ? counterpartRack.cas.find(
              (range) => range.occupantId === counterpart.entityId && range.state === 'EQUIPPED',
            )
          : undefined;
      const mount =
        allocation?.mountStartU && allocation.physicalSizeU
          ? `U${allocation.mountStartU}–U${allocation.mountStartU + allocation.physicalSizeU - 1}`
          : undefined;
      bdfbPowerBindings.push({
        breakerId,
        pathId: path.id,
        ...(path.feed ? { feed: path.feed } : {}),
        counterpartName: counterpartNode?.name ?? counterpart.entityId,
        counterpartHref: counterpartNode
          ? await service.buildDeepLink(counterpartNode.id)
          : '/power',
        counterpartContext:
          counterpartTrail.map((item) => item.name).join(' / ') || counterpart.entityId,
        ...(mount ? { mount } : {}),
      });
    }
  }

  const rackLink: string | null = null;
  const blueprintLink = node.kind === 'ROOM_SUBSTRUCTURE' ? `/blueprint/${node.id}` : null;
  const sectionDescription = descriptionFor(node);

  return (
    <main
      className={`operational-page telxius-operational-page ${['NETWORK', 'SITE', 'STRUCTURE', 'LEVEL'].includes(node.kind) ? 'mk-explorer-page' : ''} ${node.kind === 'ROOM_SUBSTRUCTURE' ? 'mk-dark-room' : ''} ${node.kind === 'DEVICE' && node.bdfb ? 'zip-bdfb-page' : ''}`}
    >
      <nav
        className="breadcrumbs operational-breadcrumbs telxius-breadcrumbs"
        aria-label="Breadcrumb"
      >
        {trailEntries.map((item, index) => (
          <Link key={item.id} href={index === trailEntries.length - 1 ? selfHref : item.href}>
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="operational-layout telxius-operational-layout">
        <aside className="operational-context">
          {node.kind === 'DEVICE' && node.bdfb ? (
            <BdfbPowerTree device={node} trail={trail} selfHref={selfHref} activePanelId={query.panel} />
          ) : (
            navigationTree && <TopologyContextTree tree={navigationTree} activeId={node.id} />
          )}
        </aside>

        <section className="operational-stage telxius-operational-stage">
          <SectionHeader
            eyebrow={eyebrowFor(node)}
            title={node.kind === 'DEVICE' && node.bdfb ? (query.panel ? (node.bdfb.shelves.flatMap((shelf) => shelf.frames).flatMap((frame) => frame.panels).find((panel) => panel.id === query.panel)?.label ?? 'PANEL') : 'BDFB PHYSICAL VIEW') : node.kind === 'ROOM_SUBSTRUCTURE' ? node.name.toUpperCase() : node.name}
            {...(sectionDescription === undefined ? {} : { description: sectionDescription })}
            actions={
              <>
                {node.kind === 'STRUCTURE' && selectedLevel && (
                  <StatusBadge tone="accent">{selectedLevel.name}</StatusBadge>
                )}
                {node.kind === 'ROOM_SUBSTRUCTURE' && canWrite && (
                  <Link className="telxius-primary-action" href={blueprintLink ?? selfHref}>
                    + ADD CLUSTER
                  </Link>
                )}
                {node.kind === 'DEVICE' && canWrite && (
                  <PinButton id={node.id} initialPinned={node.pinned} />
                )}
                {!['SITE', 'STRUCTURE', 'ROOM_SUBSTRUCTURE'].includes(node.kind) && (
                  <InspectButton entity={topologyInspector(node)} />
                )}
              </>
            }
          />

          <div className="operational-stage-body">
            {node.kind === 'DEVICE' && node.bdfb ? (
              <BdfbChassis key={query.panel ?? 'bdfb-overview'} device={node} powerBindings={bdfbPowerBindings} />
            ) : node.kind === 'ROOM_SUBSTRUCTURE' &&
              roomLayout?.ok &&
              roomLayout.value.room.polygon ? (
              <BlueprintCanvas
                polygon={roomLayout.value.room.polygon}
                clusters={roomLayout.value.clusters}
                racks={roomLayout.value.racks}
                slots={roomLayout.value.assignableSlots}
              />
            ) : node.kind === 'ROOM_SUBSTRUCTURE' && roomLayout?.ok ? (
              <StatePanel
                title="Physical geometry unavailable"
                description="This room has no preserved polygon, so MK1 will not invent a blueprint."
              />
            ) : (
              <TopologyVisualStage
                node={node}
                items={node.kind === 'STRUCTURE' ? structureLevelEntries : childEntries}
                previewItems={structurePreviewEntries}
                {...(selectedLevel ? { activeItemId: selectedLevel.id } : {})}
              />
            )}
          </div>

          {canWrite && childKinds.length > 0 && (
            <div className="operational-edit-dock">
              {childKinds.map((kind) => (
                <details className="edit-disclosure" key={kind}>
                  <summary>Create {kind.replaceAll('_', ' ').toLowerCase()}</summary>
                  <TopologyCreateForm kind={kind} parentId={node.id} />
                </details>
              ))}
            </div>
          )}
        </section>

        <TopologyPropertiesPanel
          node={node}
          contained={children.length}
          previewContained={structurePreviewNodes.length}
          location={trail.filter((item) => item.kind === 'SITE' || item.kind === 'STRUCTURE').map((item) => item.name).join(' / ')}
          feeds={bdfbPowerBindings.flatMap((binding) => binding.feed ? [binding.feed] : [])}
        />
      </div>

      {(rackLink || blueprintLink) && (
        <div className="telxius-hidden-actions" aria-hidden="true">
          {rackLink && <Link href={rackLink}>Rack</Link>}
          {blueprintLink && <Link href={blueprintLink}>Blueprint</Link>}
        </div>
      )}
    </main>
  );
}
