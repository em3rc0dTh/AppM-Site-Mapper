'use client';

import {
  SpatialAuthoringCanvas,
  type SpatialRectOverlay,
} from '@/components/spatial/spatial-authoring-canvas';
import type { RackPlacementView } from '@/modules/spatial/application/spatial-service';
import type { PointMm, RectMm } from '@/modules/spatial/domain/geometry';

function slotId(rect: RectMm): string {
  return `slot-${rect.x}-${rect.y}-${rect.width}-${rect.depth}`;
}

export function BlueprintCanvas({
  roomId,
  roomName,
  polygon,
  racks,
  slots,
  canEditBoundary,
}: Readonly<{
  roomId: string;
  roomName: string;
  polygon: readonly PointMm[];
  racks: readonly RackPlacementView[];
  slots: readonly RectMm[];
  canEditBoundary: boolean;
}>) {
  const rectangles: SpatialRectOverlay[] = [
    ...slots.map((rect) => ({
      id: slotId(rect),
      name: 'Assignable tile',
      kind: 'slot' as const,
      rect,
    })),
    ...racks.map((rack) => ({
      id: rack.id,
      name: rack.name,
      kind: 'rack' as const,
      rect: rack.rect,
      href: `/rack/${rack.id}`,
    })),
  ];

  return (
    <SpatialAuthoringCanvas
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
