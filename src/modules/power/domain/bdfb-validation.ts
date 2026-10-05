import type {
  BdfbFrameSpec,
  BdfbPanelSpec,
  BdfbShelfSpec,
  BdfbStructureSpec,
} from '@/modules/power/domain/bdfb-model';

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
  const ids = new Set<string>();
  const telemetryPoints = new Set<string>();
  let physicalNodeCount = 0;

  const claim = (id: string, label: string): BdfbValidationError | null => {
    if (!label.trim()) return 'EMPTY_LABEL';
    if (!id.trim() || ids.has(id)) return 'DUPLICATE_ID';
    ids.add(id);
    physicalNodeCount += 1;
    return null;
  };

  const validatePanel = (panel: BdfbPanelSpec): BdfbValidationError | null => {
    const panelError = claim(panel.id, panel.label);
    if (panelError) return panelError;
    if (panel.positions.length === 0) return 'EMPTY_PANEL';

    for (const breaker of panel.positions) {
      if (!breaker) continue;
      const breakerError = claim(breaker.id, breaker.label);
      if (breakerError) return breakerError;

      if (
        breaker.capacity !== undefined &&
        (!Number.isFinite(breaker.capacity) || breaker.capacity <= 0)
      ) {
        return 'INVALID_CAPACITY';
      }

      if (breaker.telemetry) {
        const rawPointId = breaker.telemetry.rawPointId.trim();
        if (!rawPointId) return 'INVALID_TELEMETRY_BINDING';
        if (telemetryPoints.has(rawPointId)) return 'DUPLICATE_TELEMETRY_POINT';
        telemetryPoints.add(rawPointId);
      }
    }
    return null;
  };

  const validateFrame = (frame: BdfbFrameSpec): BdfbValidationError | null => {
    const frameError = claim(frame.id, frame.label);
    if (frameError) return frameError;
    for (const panel of frame.panels) {
      const error = validatePanel(panel);
      if (error) return error;
    }
    return null;
  };

  const validateShelf = (shelf: BdfbShelfSpec): BdfbValidationError | null => {
    const shelfError = claim(shelf.id, shelf.label);
    if (shelfError) return shelfError;
    for (const frame of shelf.frames ?? []) {
      const error = validateFrame(frame);
      if (error) return error;
    }
    for (const panel of shelf.panels ?? []) {
      const error = validatePanel(panel);
      if (error) return error;
    }
    return null;
  };

  for (const shelf of structure.shelves ?? []) {
    const error = validateShelf(shelf);
    if (error) return { ok: false, error };
  }
  for (const frame of structure.frames ?? []) {
    const error = validateFrame(frame);
    if (error) return { ok: false, error };
  }
  for (const panel of structure.panels ?? []) {
    const error = validatePanel(panel);
    if (error) return { ok: false, error };
  }

  if (physicalNodeCount === 0) return { ok: false, error: 'EMPTY_BDFB' };
  return { ok: true };
}
