import type { BdfbStructure } from '@/modules/topology/domain/entities';

export type BdfbValidationError =
  'EMPTY_BDFB' | 'EMPTY_LABEL' | 'DUPLICATE_ID' | 'DUPLICATE_ENDPOINT_LABEL' | 'INVALID_CAPACITY';

export function validateBdfb(
  structure: BdfbStructure,
): { ok: true } | { ok: false; error: BdfbValidationError } {
  if (structure.shelves.length === 0) {
    return { ok: false, error: 'EMPTY_BDFB' };
  }

  const ids = new Set<string>();

  for (const shelf of structure.shelves) {
    if (!shelf.label.trim()) {
      return { ok: false, error: 'EMPTY_LABEL' };
    }

    if (ids.has(shelf.id)) {
      return { ok: false, error: 'DUPLICATE_ID' };
    }
    ids.add(shelf.id);

    for (const frame of shelf.frames) {
      if (!frame.label.trim() || ids.has(frame.id)) {
        return { ok: false, error: !frame.label.trim() ? 'EMPTY_LABEL' : 'DUPLICATE_ID' };
      }
      ids.add(frame.id);

      for (const panel of frame.panels) {
        if (!panel.label.trim() || ids.has(panel.id)) {
          return { ok: false, error: !panel.label.trim() ? 'EMPTY_LABEL' : 'DUPLICATE_ID' };
        }
        ids.add(panel.id);

        const endpointLabels = new Set<string>();

        for (const endpoint of panel.endpoints) {
          if (!endpoint.label.trim()) {
            return { ok: false, error: 'EMPTY_LABEL' };
          }

          if (
            endpoint.capacity !== undefined &&
            (!Number.isFinite(endpoint.capacity) || endpoint.capacity <= 0)
          ) {
            return { ok: false, error: 'INVALID_CAPACITY' };
          }

          if (ids.has(endpoint.id)) {
            return { ok: false, error: 'DUPLICATE_ID' };
          }
          ids.add(endpoint.id);

          const normalized = endpoint.label.trim().toLowerCase();

          if (endpointLabels.has(normalized)) {
            return { ok: false, error: 'DUPLICATE_ENDPOINT_LABEL' };
          }
          endpointLabels.add(normalized);
        }
      }
    }
  }

  return { ok: true };
}
