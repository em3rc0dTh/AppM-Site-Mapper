export interface BdfbTelemetryPointSpec {
  readonly rawPointId: string;
}

export interface BdfbBreakerSpec {
  readonly id: string;
  readonly label: string;
  readonly capacity?: number;
  readonly telemetry?: BdfbTelemetryPointSpec;
}

export interface BdfbPanelSpec {
  readonly id: string;
  readonly label: string;
  /** Positional semantics are explicit: an empty physical position is null. */
  readonly positions: readonly (BdfbBreakerSpec | null)[];
}

export interface BdfbFrameSpec {
  readonly id: string;
  readonly label: string;
  /**
   * False means the frame is a presentation grouping only. It is never persisted
   * as Equipment when the physical hardware has no frame.
   */
  readonly physicalFrameVisible?: boolean;
  readonly panels: readonly BdfbPanelSpec[];
}

export interface BdfbShelfSpec {
  readonly id: string;
  readonly label: string;
  readonly frames?: readonly BdfbFrameSpec[];
  readonly panels?: readonly BdfbPanelSpec[];
}

/**
 * BDFB physical structure. Shelf and Frame are optional because the domain must
 * describe the hardware that exists, not manufacture intermediate Equipment.
 */
export interface BdfbStructureSpec {
  readonly shelves?: readonly BdfbShelfSpec[];
  readonly frames?: readonly BdfbFrameSpec[];
  readonly panels?: readonly BdfbPanelSpec[];
}

export interface BdfbBreakerView {
  readonly id: string;
  readonly label: string;
  readonly capacity?: number;
  readonly rawPointId?: string;
  readonly accessPortId: string;
}

export interface BdfbPanelView {
  readonly id: string;
  readonly label: string;
  readonly positions: readonly (BdfbBreakerView | null)[];
}

export interface BdfbFrameView {
  readonly id: string;
  readonly label: string;
  readonly physical: boolean;
  readonly panels: readonly BdfbPanelView[];
}

export interface BdfbShelfView {
  readonly id: string;
  readonly label: string;
  /** False means this group exists only in the presentation model. */
  readonly physical?: boolean;
  readonly frames: readonly BdfbFrameView[];
}

export interface BdfbPresentation {
  readonly deviceId: string;
  readonly chassisId: string;
  readonly shelves: readonly BdfbShelfView[];
}


function canonicalBdfbPanel(
  id: string,
  label: string,
  rawPointGroup: number,
): BdfbPanelSpec {
  return {
    id,
    label,
    positions: Array.from({ length: 24 }, (_, index) => {
      const position = index + 1;
      return {
        id: `${id}:breaker:${String(position).padStart(2, '0')}`,
        label: `${label}-${String(position).padStart(2, '0')}`,
        telemetry: { rawPointId: `0_${rawPointGroup}_${position}` },
      };
    }),
  };
}

/**
 * Canonical Site Mapper BDFB profile for the current 96-circuit telemetry contract.
 * Feed A/B are presentation groupings only. No physical Shelf or Frame Equipment
 * is materialized unless the real hardware model explicitly requires one.
 */
export function canonicalBdfb96Structure(): BdfbStructureSpec {
  return {
    frames: [
      {
        id: 'feed-a',
        label: 'A',
        physicalFrameVisible: false,
        panels: [
          canonicalBdfbPanel('panel-a1', 'A1', 1),
          canonicalBdfbPanel('panel-a2', 'A2', 2),
        ],
      },
      {
        id: 'feed-b',
        label: 'B',
        physicalFrameVisible: false,
        panels: [
          canonicalBdfbPanel('panel-b1', 'B1', 3),
          canonicalBdfbPanel('panel-b2', 'B2', 4),
        ],
      },
    ],
  };
}
