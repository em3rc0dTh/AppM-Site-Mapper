import type { BdfbStructureSpec } from '@/modules/power/domain/bdfb-model';

export type BdfbValidationError =
  | 'EMPTY_BDFB'
  | 'EMPTY_LABEL'
  | 'DUPLICATE_ID'
  | 'INVALID_CAPACITY'
  | 'INVALID_TELEMETRY_BINDING'
  | 'DUPLICATE_TELEMETRY_POINT'
  | 'EMPTY_PANEL';

export function validateBdfb(
  structure: BdfbStructureSpec,
): { ok: true } | { ok: false; error: BdfbValidationError } {
  if (structure.shelves.length === 0) return { ok: false, error: 'EMPTY_BDFB' };

  const ids = new Set<string>();
  const telemetryPoints = new Set<string>();

  const claim = (id: string, label: string): BdfbValidationError | null => {
    if (!label.trim()) return 'EMPTY_LABEL';
    if (!id.trim() || ids.has(id)) return 'DUPLICATE_ID';
    ids.add(id);
    return null;
  };

  for (const shelf of structure.shelves) {
    const shelfError = claim(shelf.id, shelf.label);
    if (shelfError) return { ok: false, error: shelfError };

    for (const frame of shelf.frames) {
      const frameError = claim(frame.id, frame.label);
      if (frameError) return { ok: false, error: frameError };

      for (const panel of frame.panels) {
        const panelError = claim(panel.id, panel.label);
        if (panelError) return { ok: false, error: panelError };
        if (panel.positions.length === 0) return { ok: false, error: 'EMPTY_PANEL' };

        for (const breaker of panel.positions) {
          if (!breaker) continue;

          const breakerError = claim(breaker.id, breaker.label);
          if (breakerError) return { ok: false, error: breakerError };

          if (
            breaker.capacity !== undefined &&
            (!Number.isFinite(breaker.capacity) || breaker.capacity <= 0)
          ) {
            return { ok: false, error: 'INVALID_CAPACITY' };
          }

          if (breaker.telemetry) {
            const rawPointId = breaker.telemetry.rawPointId.trim();
            if (!rawPointId) return { ok: false, error: 'INVALID_TELEMETRY_BINDING' };
            if (telemetryPoints.has(rawPointId)) {
              return { ok: false, error: 'DUPLICATE_TELEMETRY_POINT' };
            }
            telemetryPoints.add(rawPointId);
          }
        }
      }
    }
  }

  return { ok: true };
}
