import { SiteBoundaryWorkspace } from '@/components/topology/site-boundary-workspace';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BlueprintCanvas } from '@/components/blueprint/blueprint-canvas';
import { BdfbChassis, type BreakerPowerBinding } from '@/components/power/bdfb-chassis';
import { BdfbTelemetryInspector } from '@/components/power/bdfb-telemetry-inspector';
import { BdfbPowerTree } from '@/components/power/bdfb-power-tree';
import { TopologyContextTree } from '@/components/topology/context-tree';
import { TopologyCreateControl } from '@/components/topology/topology-create-form';
import { TopologyPropertiesPanel } from '@/components/topology/topology-properties-panel';
import {
  TopologyVisualStage,
  type VisualStageChild,
} from '@/components/topology/topology-visual-stage';
import { PinButton } from '@/components/workspace/pin-button';
import { requirePermission } from '@/modules/identity/application/current-session';
import { BdfbProjectionService } from '@/modules/power/application/bdfb-projection-service';
import { resolvePowerEndpoint } from '@/modules/power/domain/endpoint-validation';
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

function feedFromLabel(label: string): 'A' | 'B' | undefined {
  const normalized = label.trim().toUpperCase();
  if (/^A(?:\d|\b|[\s_-])/.test(normalized) || /FEED\s*A\b/.test(normalized)) return 'A';
  if (/^B(?:\d|\b|[\s_-])/.test(normalized) || /FEED\s*B\b/.test(normalized)) return 'B';
  return undefined;
}

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
      return node.deviceType === 'BDFB' ? 'POWER / BDFB INTERNALS' : 'DEVICE';
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
      return node.deviceType === 'BDFB'
        ? 'Physical distribution hierarchy · live MQTT overlay'
        : undefined;
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
  if (node.kind === 'CONTAINER_CLUSTER_BAY' || node.kind === 'POSITION') {
    const ancestry = await service.getTrail(node.id);
    const room = [...ancestry].reverse().find((entry) => entry.kind === 'ROOM_SUBSTRUCTURE');
    if (room) {
      const context = node.kind === 'POSITION' ? 'position' : 'bay';
      redirect(`/blueprint/${room.id}?${context}=${encodeURIComponent(node.id)}`);
    }
  }
  function openRoom(candidate: TopologyNode): void {
    if (candidate.kind === 'ROOM_SUBSTRUCTURE') redirect(`/blueprint/${candidate.id}`);
  }
  openRoom(node);
  if (node.kind === 'CONTAINER_RACK') redirect(`/rack/${node.id}`);
  const bdfbPresentation =
    node.kind === 'DEVICE' && node.deviceType === 'BDFB'
      ? await new BdfbProjectionService(repository).get(node.id)
      : null;
  if ((node.kind === 'DEVICE' && !bdfbPresentation) || node.kind === 'EQUIPMENT') {
    redirect(`/device/${node.id}`);
  }
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
  const canWritePower = hasPermission(auth.value.role, 'power:write');
  const siteContext =
    node.kind === 'STRUCTURE' ? [...trail].reverse().find((entry) => entry.kind === 'SITE') : null;
  const siteBoundary =
    siteContext?.kind === 'SITE' && siteContext.polygon ? siteContext.polygon : [];

  const childEntries: VisualStageChild[] = await Promise.all(
    children.map(async (child) => {
      const deepLink = await service.buildDeepLink(child.id);
      const href =
        child.kind === 'CONTAINER_RACK' && child.variant === 'RACK'
          ? `/rack/${child.id}`
          : deepLink;

      return { node: child, href, directChildCount: (await service.listChildren(child.id)).length };
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
  if (node.kind === 'DEVICE' && bdfbPresentation) {
    const breakerByPort = new Map(
      bdfbPresentation.shelves.flatMap((shelf) =>
        shelf.frames.flatMap((frame) =>
          frame.panels.flatMap((panel) =>
            panel.positions.flatMap((breaker) =>
              breaker
                ? [
                    [
                      breaker.accessPortId,
                      {
                        breakerId: breaker.id,
                        feed:
                          feedFromLabel(panel.label) ??
                          feedFromLabel(frame.label) ??
                          feedFromLabel(shelf.label),
                      },
                    ] as const,
                  ]
                : [],
            ),
          ),
        ),
      ),
    );
    const seenPhysicalPaths = new Set<string>();
    const activePaths = await (await createPowerRepository()).listActive();
    for (const path of activePaths) {
      const breaker = breakerByPort.get(path.sourceAccessPortId);
      if (!breaker) continue;

      const effectiveFeed = breaker.feed ?? path.feed;
      const physicalKey = `${path.sourceAccessPortId}\u0000${path.targetAccessPortId}`;
      if (seenPhysicalPaths.has(physicalKey)) continue;
      seenPhysicalPaths.add(physicalKey);

      const counterpart = await resolvePowerEndpoint(repository, path.targetAccessPortId);
      if (!counterpart) continue;
      const counterpartNode = counterpart.equipment;
      const counterpartTrail = await service.getTrail(counterpartNode.id);
      const placement = counterpartNode.rackPlacement;
      const mount =
        placement?.mode === 'U_RANGE' &&
        placement.startU !== undefined &&
        placement.sizeU !== undefined
          ? `U${placement.startU}–U${placement.startU + placement.sizeU - 1}`
          : placement?.mode === 'FULL_RACK'
            ? 'Full rack'
            : undefined;

      bdfbPowerBindings.push({
        breakerId: breaker.breakerId,
        pathId: path.id,
        ...(effectiveFeed ? { feed: effectiveFeed } : {}),
        counterpartName: counterpartNode.name,
        counterpartHref: `/device/${counterpartNode.id}`,
        counterpartContext:
          counterpartTrail.map((item) => item.name).join(' / ') || counterpartNode.id,
        accessPortLabel: counterpart.port.name,
        ...(mount ? { mount } : {}),
      });
    }
  }

  const rackLink: string | null = null;
  const blueprintLink = node.kind === 'ROOM_SUBSTRUCTURE' ? `/blueprint/${node.id}` : null;
  const sectionDescription = descriptionFor(node);

  return (
    <main
      className={`operational-page telxius-operational-page ${['NETWORK', 'SITE', 'STRUCTURE', 'LEVEL'].includes(node.kind) ? 'mk-explorer-page' : ''} ${node.kind === 'ROOM_SUBSTRUCTURE' ? 'mk-dark-room' : ''} ${node.kind === 'DEVICE' && bdfbPresentation ? 'zip-bdfb-page' : ''}`}
    >
      <nav
        className="breadcrumbs operational-breadcrumbs telxius-breadcrumbs"
        aria-label="Breadcrumb"
      >
        {trailEntries
          .filter((item, index) => {
            const kind = trail[index]?.kind;
            return (
              kind === 'SITE' ||
              kind === 'STRUCTURE' ||
              kind === 'LEVEL' ||
              kind === 'ROOM_SUBSTRUCTURE' ||
              kind === 'CONTAINER_RACK' ||
              item.id === node.id
            );
          })
          .map((item) => (
            <Link key={item.id} href={item.id === node.id ? selfHref : item.href} title={item.name}>
              {item.name}
            </Link>
          ))}
      </nav>

      <div className="operational-layout telxius-operational-layout">
        <aside className="operational-context">
          {navigationTree && <TopologyContextTree tree={navigationTree} activeId={node.id} />}
          {node.kind === 'DEVICE' && bdfbPresentation && (
            <details className="context-power-disclosure">
              <summary>Electrical hierarchy · panels</summary>
              <BdfbPowerTree
                device={node}
                trail={trail}
                selfHref={selfHref}
                activePanelId={query.panel}
                presentation={bdfbPresentation}
              />
            </details>
          )}
        </aside>

        <section className="operational-stage telxius-operational-stage">
          <SectionHeader
            eyebrow={eyebrowFor(node)}
            title={
              node.kind === 'DEVICE' && bdfbPresentation
                ? query.panel
                  ? (bdfbPresentation.shelves
                      .flatMap((shelf) => shelf.frames)
                      .flatMap((frame) => frame.panels)
                      .find((panel) => panel.id === query.panel)?.label ?? 'PANEL')
                  : 'BDFB PHYSICAL VIEW'
                : node.kind === 'ROOM_SUBSTRUCTURE'
                  ? node.name.toUpperCase()
                  : node.name
            }
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
            {node.kind === 'DEVICE' && bdfbPresentation ? (
              <BdfbChassis
                key={query.panel ?? 'bdfb-overview'}
                device={node}
                presentation={bdfbPresentation}
                powerBindings={bdfbPowerBindings}
                canWritePower={canWritePower}
              />
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
            ) : node.kind === 'SITE' || node.kind === 'STRUCTURE' ? (
              <SiteBoundaryWorkspace
                node={node}
                canWrite={canWrite}
                {...(node.kind === 'STRUCTURE' ? { context: siteBoundary } : {})}
              >
                <TopologyVisualStage
                  node={node}
                  items={node.kind === 'STRUCTURE' ? structureLevelEntries : childEntries}
                  previewItems={structurePreviewEntries}
                  {...(selectedLevel ? { activeItemId: selectedLevel.id } : {})}
                />
              </SiteBoundaryWorkspace>
            ) : (
              <TopologyVisualStage
                node={node}
                items={childEntries}
                previewItems={structurePreviewEntries}
                {...(selectedLevel ? { activeItemId: selectedLevel.id } : {})}
              />
            )}
          </div>

          {canWrite && childKinds.length > 0 && (
            <div className="operational-edit-dock">
              {childKinds.map((kind) => (
                <TopologyCreateControl
                  key={kind}
                  kind={kind}
                  parentId={node.id}
                  {...(node.kind === 'SITE' && kind === 'STRUCTURE' && node.polygon
                    ? { boundaryContext: node.polygon }
                    : {})}
                />
              ))}
            </div>
          )}
        </section>

        {node.kind === 'DEVICE' && bdfbPresentation ? (
          <BdfbTelemetryInspector
            key={query.panel ?? 'bdfb-inspector'}
            node={node}
            presentation={bdfbPresentation}
            {...(query.panel ? { activePanelId: query.panel } : {})}
            location={trail
              .filter((item) => item.kind === 'SITE' || item.kind === 'STRUCTURE')
              .map((item) => item.name)
              .join(' / ')}
            feeds={bdfbPowerBindings.flatMap((binding) => (binding.feed ? [binding.feed] : []))}
          />
        ) : (
          <TopologyPropertiesPanel
            node={node}
            contained={children.length}
            previewContained={structurePreviewNodes.length}
            location={trail
              .filter((item) => item.kind === 'SITE' || item.kind === 'STRUCTURE')
              .map((item) => item.name)
              .join(' / ')}
            feeds={bdfbPowerBindings.flatMap((binding) => (binding.feed ? [binding.feed] : []))}
          />
        )}
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
