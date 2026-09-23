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
}>) {
  const rectangles: SpatialRectOverlay[] = [
    ...clusters.map((cluster) => ({
      id: cluster.id,
      name: cluster.name,
      ...(navigationHrefs[cluster.id] ? { href: navigationHrefs[cluster.id] } : {}),
      detail: `${cluster.positionCount} positions · extent derived from positions`,
      kind: 'bay' as const,
      rect: cluster.rect,
    })),
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

  return (
    <SpatialAuthoringCanvas
      key={roomId}
      entityId={roomId}
      entityName={roomName}
      entityKind="ROOM / SUBSTRUCTURE"
      initialPolygon={polygon}
      canWrite={canEditBoundary}
      gridSizeMm={600}
      rectangles={rectangles}
      title="Blueprint"
      subtitle="600 mm operational grid"
    />
  );
}
