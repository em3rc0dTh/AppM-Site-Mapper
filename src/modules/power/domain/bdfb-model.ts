export interface BdfbBreakerView {
  readonly id: string;
  readonly label: string;
  readonly capacity?: number;
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

/**
 * Read-only BDFB projection built from canonical recursive Equipment.
 * This model never materializes topology and is not a second write model.
 */
export interface BdfbPresentation {
  readonly deviceId: string;
  readonly chassisId: string;
  readonly shelves: readonly BdfbShelfView[];
}
