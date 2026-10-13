import type { EquipmentNode } from '@/modules/topology/domain/entities';

/**
 * Presentation-only projection of canonical Equipment.children.
 * The array index is the physical slot for POSITIONAL Equipment.
 * Neither layout nor Access Ports create synthetic Equipment instances.
 */
export interface CompositionSlot {
  readonly index: number;
  readonly equipmentId: string | null;
  readonly equipment: EquipmentNode | null;
}

export interface CompositionProjection {
  readonly slots: readonly CompositionSlot[];
  readonly capacity: number;
  readonly occupied: number;
  readonly available: number;
  readonly positional: boolean;
  readonly direction: 'ROW' | 'COLUMN';
  readonly maxPerLine: number | null;
  readonly childrenVisibility: 'AUTO' | 'INLINE' | 'SUMMARY';
}

export function projectEquipmentComposition(
  equipment: EquipmentNode,
  equipmentById: ReadonlyMap<string, EquipmentNode>,
): CompositionProjection {
  const slots = equipment.children.map((equipmentId, index) => ({
    index,
    equipmentId,
    equipment: equipmentId ? (equipmentById.get(equipmentId) ?? null) : null,
  }));
  const occupied = slots.filter((slot) => slot.equipmentId !== null).length;
  return {
    slots,
    capacity: slots.length,
    occupied,
    available: equipment.childMode === 'POSITIONAL' ? slots.length - occupied : 0,
    positional: equipment.childMode === 'POSITIONAL',
    direction: equipment.presentation?.direction ?? 'ROW',
    maxPerLine: equipment.presentation?.maxPerLine ?? null,
    childrenVisibility: equipment.presentation?.childrenVisibility ?? 'AUTO',
  };
}

/**
 * AUTO limits recursive visual density. A focused 24/48-position board can
 * render its slots; child previews never expand their own descendants.
 */
export function shouldSummarizeFocus(projection: CompositionProjection): boolean {
  if (projection.childrenVisibility === 'SUMMARY') return projection.capacity > 0;
  if (projection.childrenVisibility === 'INLINE') return false;
  if (projection.positional) return projection.capacity > 96;
  return projection.capacity > 4;
}

export interface ResponsiveCompositionGrid {
  readonly columns: number;
  readonly rows: number;
  readonly direction: 'ROW' | 'COLUMN';
}

/** The maximum per row/column is a hint; available width wins over overflow. */
export function projectResponsiveCompositionGrid(
  projection: CompositionProjection,
  widthPx: number,
): ResponsiveCompositionGrid {
  const dense = projection.positional && projection.capacity > 4;
  const cellWidth = dense ? 96 : 255;
  const gap = dense ? 6 : 14;
  const availableColumns = Math.max(
    1,
    Math.floor((Math.max(1, widthPx) + gap) / (cellWidth + gap)),
  );
  const count = Math.max(1, projection.capacity);
  const limit = projection.maxPerLine ?? (dense ? 12 : 4);
  const requiredRows = Math.ceil(count / availableColumns);
  if (projection.direction === 'COLUMN' && requiredRows <= limit) {
    return {
      columns: Math.ceil(count / requiredRows),
      rows: requiredRows,
      direction: 'COLUMN',
    };
  }
  const columns = Math.max(1, Math.min(count, availableColumns, limit));
  return {
    columns,
    rows: Math.ceil(count / columns),
    direction: 'ROW',
  };
}
