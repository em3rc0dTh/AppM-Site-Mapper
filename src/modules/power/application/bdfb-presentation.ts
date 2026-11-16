import type { BdfbPresentation } from '@/modules/power/domain/bdfb-model';

/**
 * Compatibility utility for presentation-only call sites.
 * Canonical BDFB materialization lives in Equipment and must be projected by
 * BdfbProjectionService before reaching this function.
 */
export function getBdfbPresentation(presentation: BdfbPresentation): BdfbPresentation {
  return presentation;
}
