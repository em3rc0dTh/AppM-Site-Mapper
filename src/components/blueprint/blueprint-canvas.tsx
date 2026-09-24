'use client';

import {
  SpatialAuthoringCanvas,
  type SpatialRectOverlay,
} from '@/components/spatial/spatial-authoring-canvas';
import type {
  ClusterPlacementView,
  PositionPlacementView,
  RackPlacementView,
} from '@/modules/spatial/application/spatial-service';
import type { PointMm, RectMm } from '@/modules/spatial/domain/geometry';

function slotId(rect: RectMm): string {
  return `slot-${rect.x}-${rect.y}-${rect.width}-${rect.depth}`;
}

export function BlueprintCanvas({
  roomId,
  navigationHrefs = {},
  roomName,
  polygon,
  clusters,
  positions,
  racks,
  slots,
  canEditBoundary,
  focusClusterId,
}: Readonly<{
  roomId: string;
  navigationHrefs?: Readonly<Record<string, string>>;
  roomName: string;
  polygon: readonly PointMm[];
  clusters: readonly ClusterPlacementView[];
  positions: readonly PositionPlacementView[];
  racks: readonly RackPlacementView[];
  slots: readonly RectMm[];
  canEditBoundary: boolean;
  focusClusterId?: string;
}>) {
  const rectangles: SpatialRectOverlay[] = [
    ...clusters.flatMap((cluster) =>
      cluster.rect
        ? [
            {
              id: cluster.id,
              name: cluster.name,
              ...(navigationHrefs[cluster.id] ? { href: navigationHrefs[cluster.id] } : {}),
              detail: `${cluster.positionCount} positions · extent derived from positions + rack footprints`,
              kind: 'bay' as const,
              rect: cluster.rect,
            },
          ]
        : [],
    ),
    ...slots.map((rect) => ({
      id: slotId(rect),
      name: 'Assignable tile',
      kind: 'slot' as const,
      rect,
    })),
    ...positions.map((position) => ({
      id: position.id,
      name: position.name,
      detail: `${position.coordinate} · ${position.occupied ? 'Occupied' : 'Available'}`,
      ...(navigationHrefs[position.id] ? { href: navigationHrefs[position.id] } : {}),
      kind: 'position' as const,
      rect: position.rect,
    })),
    ...racks.map((rack) => ({
      id: rack.id,
      name: rack.name,
      kind: 'rack' as const,
      rect: rack.rect,
      href: `/rack/${rack.id}`,
      popupHref: `/popup/container/${rack.id}`,
    })),
  ];

  const unplacedClusters = clusters.filter((cluster) => !cluster.rect);

  return (
    <div className="blueprint-workspace">
      <SpatialAuthoringCanvas
        key={roomId}
        entityId={roomId}
        entityName={roomName}
        entityKind="ROOM / SUBSTRUCTURE"
        initialPolygon={polygon}
        canWrite={canEditBoundary}
        autoEditWhenEmpty
        gridSizeMm={600}
        rectangles={rectangles}
        title="Blueprint"
        subtitle="600 mm operational grid"
      />
      {unplacedClusters.length > 0 && (
        <aside className="blueprint-unplaced" aria-label="Unplaced clusters">
          <span>UNPLACED PHYSICAL ENTITY</span>
          {unplacedClusters.map((cluster) => (
            <div key={cluster.id}>
              <strong>{cluster.name}</strong>
              <small>
                {cluster.variant.replaceAll('_', ' ')} · UNPLACED · define start/end on the Room grid
              </small>
              {focusClusterId === cluster.id ? (
                <b>CURRENT CLUSTER</b>
              ) : (
                navigationHrefs[cluster.id] && (
                  <a href={navigationHrefs[cluster.id]}>Open cluster →</a>
                )
              )}
            </div>
          ))}
          <p>
            Open the cluster and mark its start and end slots. Site Mapper will generate every
            600 × 600 mm Position in that horizontal or vertical run.
          </p>
        </aside>
      )}
    </div>
  );
}
