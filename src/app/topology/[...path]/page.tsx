import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BlueprintCanvas } from '@/components/blueprint/blueprint-canvas';
import { BdfbChassis } from '@/components/power/bdfb-chassis';
import { TopologyContextTree } from '@/components/topology/context-tree';
import { TopologyCreateForm } from '@/components/topology/topology-create-form';
import { TopologyPropertiesPanel } from '@/components/topology/topology-properties-panel';
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
  searchParams: Promise<{ level?: string }>;
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
  const [trail, children, selfHref] = await Promise.all([
    service.getTrail(node.id),
    service.listChildren(node.id),
    service.buildDeepLink(node.id),
  ]);
  const root = trail[0];
  const navigationTree = root ? await service.buildNavigationTree(root.id) : null;
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
          href: `${selfHref}?level=${level.id}`,
        }))
      : [];

  const roomLayout =
    node.kind === 'ROOM_SUBSTRUCTURE'
      ? await new SpatialService(repository).getRoomLayout(node.id)
      : null;

  const rackLink =
    node.kind === 'CONTAINER_RACK' && node.variant === 'RACK' ? `/rack/${node.id}` : null;
  const blueprintLink = node.kind === 'ROOM_SUBSTRUCTURE' ? `/blueprint/${node.id}` : null;

  return (
    <main className="operational-page telxius-operational-page">
      <nav className="breadcrumbs operational-breadcrumbs telxius-breadcrumbs" aria-label="Breadcrumb">
        {trail.map((item, index) => (
          <Link key={item.id} href={index === trail.length - 1 ? selfHref : await service.buildDeepLink(item.id)}>
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="operational-layout telxius-operational-layout">
        <aside className="operational-context">
          {navigationTree && <TopologyContextTree tree={navigationTree} activeId={node.id} />}
        </aside>

        <section className="operational-stage telxius-operational-stage">
          <SectionHeader
            eyebrow={eyebrowFor(node)}
            title={node.kind === 'ROOM_SUBSTRUCTURE' ? node.name.toUpperCase() : node.name}
            description={descriptionFor(node)}
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
                {(node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') && canWrite && (
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
              <BdfbChassis device={node} />
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
                activeItemId={selectedLevel?.id}
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
