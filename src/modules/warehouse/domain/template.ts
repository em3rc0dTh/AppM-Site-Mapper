import type {
  BdfbFrameSpec,
  BdfbPanelSpec,
  BdfbShelfSpec,
  BdfbStructureSpec,
} from '@/modules/power/domain/bdfb-model';
import type { DimensionsMm } from '@/modules/topology/domain/entities';
import type { DomainEntity } from '@/shared/domain/entity';

export type AssetTemplateKind = 'DEVICE' | 'EQUIPMENT';
export type WarehouseDeviceType = 'BDFB';

/** A null endpoint is the canonical representation of an empty physical position. */
export interface BdfbEndpointBlueprint {
  readonly label: string;
  readonly capacity?: number;
  readonly rawPointId?: string;
}

export interface BdfbPanelBlueprint {
  readonly label: string;
  readonly endpoints: readonly (BdfbEndpointBlueprint | null)[];
}

export interface BdfbFrameBlueprint {
  readonly label: string;
  readonly physicalFrameVisible?: boolean;
  readonly panels: readonly BdfbPanelBlueprint[];
}

export interface BdfbShelfBlueprint {
  readonly label: string;
  readonly frames?: readonly BdfbFrameBlueprint[];
  readonly panels?: readonly BdfbPanelBlueprint[];
}

export interface BdfbPhysicalBlueprint {
  readonly type: 'BDFB';
  readonly shelves?: readonly BdfbShelfBlueprint[];
  readonly frames?: readonly BdfbFrameBlueprint[];
  readonly panels?: readonly BdfbPanelBlueprint[];
}

export type PhysicalBlueprint = BdfbPhysicalBlueprint;

export interface AssetTemplate extends DomainEntity {
  readonly kind: AssetTemplateKind;
  readonly version: number;
  readonly name: string;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly category?: string;
  readonly sizeU?: number;
  readonly dimensionsMm?: DimensionsMm;
  readonly notes?: string;
  readonly deviceType?: WarehouseDeviceType;
  readonly physicalBlueprint?: PhysicalBlueprint;
}

export interface AssetTemplateSnapshot {
  readonly templateId: string;
  readonly templateVersion: number;
  readonly templateName: string;
  readonly kind: AssetTemplateKind;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly category?: string;
  readonly sizeU?: number;
  readonly dimensionsMm?: DimensionsMm;
  readonly deviceType?: WarehouseDeviceType;
}

export function snapshotTemplate(template: AssetTemplate): AssetTemplateSnapshot {
  return {
    templateId: template.id,
    templateVersion: template.version,
    templateName: template.name,
    kind: template.kind,
    ...(template.manufacturer ? { manufacturer: template.manufacturer } : {}),
    ...(template.model ? { model: template.model } : {}),
    ...(template.category ? { category: template.category } : {}),
    ...(template.sizeU === undefined ? {} : { sizeU: template.sizeU }),
    ...(template.dimensionsMm ? { dimensionsMm: template.dimensionsMm } : {}),
    ...(template.deviceType ? { deviceType: template.deviceType } : {}),
  };
}

function panelSpec(
  panel: BdfbPanelBlueprint,
  id: string,
): BdfbPanelSpec {
  return {
    id,
    label: panel.label,
    positions: panel.endpoints.map((endpoint, endpointIndex) => {
      if (!endpoint) return null;
      return {
        id: `${id}:e${endpointIndex + 1}`,
        label: endpoint.label,
        ...(endpoint.capacity === undefined ? {} : { capacity: endpoint.capacity }),
        ...(endpoint.rawPointId ? { telemetry: { rawPointId: endpoint.rawPointId } } : {}),
      };
    }),
  };
}

function frameSpec(
  frame: BdfbFrameBlueprint,
  id: string,
): BdfbFrameSpec {
  return {
    id,
    label: frame.label,
    ...(frame.physicalFrameVisible === undefined
      ? {}
      : { physicalFrameVisible: frame.physicalFrameVisible }),
    panels: frame.panels.map((panel, panelIndex) => panelSpec(panel, `${id}:p${panelIndex + 1}`)),
  };
}

function shelfSpec(
  shelf: BdfbShelfBlueprint,
  id: string,
): BdfbShelfSpec {
  return {
    id,
    label: shelf.label,
    ...((shelf.frames?.length ?? 0) > 0
      ? {
          frames: shelf.frames!.map((frame, frameIndex) =>
            frameSpec(frame, `${id}:f${frameIndex + 1}`),
          ),
        }
      : {}),
    ...((shelf.panels?.length ?? 0) > 0
      ? {
          panels: shelf.panels!.map((panel, panelIndex) =>
            panelSpec(panel, `${id}:p${panelIndex + 1}`),
          ),
        }
      : {}),
  };
}

export function materializeBdfbBlueprint(
  blueprint: BdfbPhysicalBlueprint,
  deviceId: string,
): BdfbStructureSpec {
  const root = `${deviceId}:bdfb`;
  return {
    ...((blueprint.shelves?.length ?? 0) > 0
      ? {
          shelves: blueprint.shelves!.map((shelf, shelfIndex) =>
            shelfSpec(shelf, `${root}:s${shelfIndex + 1}`),
          ),
        }
      : {}),
    ...((blueprint.frames?.length ?? 0) > 0
      ? {
          frames: blueprint.frames!.map((frame, frameIndex) =>
            frameSpec(frame, `${root}:f${frameIndex + 1}`),
          ),
        }
      : {}),
    ...((blueprint.panels?.length ?? 0) > 0
      ? {
          panels: blueprint.panels!.map((panel, panelIndex) =>
            panelSpec(panel, `${root}:p${panelIndex + 1}`),
          ),
        }
      : {}),
  };
}
