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
  readonly physicalFrameVisible?: boolean;
  readonly panels: readonly BdfbPanelSpec[];
}

export interface BdfbShelfSpec {
  readonly id: string;
  readonly label: string;
  readonly frames: readonly BdfbFrameSpec[];
}

export interface BdfbStructureSpec {
  readonly shelves: readonly BdfbShelfSpec[];
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
  readonly frames: readonly BdfbFrameView[];
}

export interface BdfbPresentation {
  readonly deviceId: string;
  readonly chassisId: string;
  readonly shelves: readonly BdfbShelfView[];
}
