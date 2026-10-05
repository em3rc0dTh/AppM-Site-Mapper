import type { BdfbStructureSpec } from '@/modules/power/domain/bdfb-model';
import type { DimensionsMm } from '@/modules/topology/domain/entities';
import type { DomainEntity } from '@/shared/domain/entity';

export type AssetTemplateKind = 'DEVICE' | 'EQUIPMENT';
export type WarehouseDeviceType = 'BDFB';

/**
 * Warehouse import compatibility only. HOLDER is translated to a null positional
 * slot before materialization and never enters the canonical v1.2 topology model.
 */
export type BdfbEndpointBlueprintVariant = 'BREAKER' | 'HOLDER';

export interface BdfbEndpointBlueprint {
  readonly label: string;
  readonly variant: BdfbEndpointBlueprintVariant;
  readonly capacity?: number;
  readonly rawPointId?: string;
}

export interface BdfbPanelBlueprint {
  readonly label: string;
  readonly endpoints: readonly BdfbEndpointBlueprint[];
}

export interface BdfbFrameBlueprint {
  readonly label: string;
  readonly physicalFrameVisible?: boolean;
  readonly panels: readonly BdfbPanelBlueprint[];
}

export interface BdfbShelfBlueprint {
  readonly label: string;
  readonly frames: readonly BdfbFrameBlueprint[];
}

export interface BdfbPhysicalBlueprint {
  readonly type: 'BDFB';
  readonly shelves: readonly BdfbShelfBlueprint[];
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

export function materializeBdfbBlueprint(
  blueprint: BdfbPhysicalBlueprint,
  deviceId: string,
): BdfbStructureSpec {
  return {
    shelves: blueprint.shelves.map((shelf, shelfIndex) => ({
      id: `${deviceId}:bdfb:s${shelfIndex + 1}`,
      label: shelf.label,
      frames: shelf.frames.map((frame, frameIndex) => ({
        id: `${deviceId}:bdfb:s${shelfIndex + 1}:f${frameIndex + 1}`,
        label: frame.label,
        ...(frame.physicalFrameVisible === undefined
          ? {}
          : { physicalFrameVisible: frame.physicalFrameVisible }),
        panels: frame.panels.map((panel, panelIndex) => ({
          id: `${deviceId}:bdfb:s${shelfIndex + 1}:f${frameIndex + 1}:p${panelIndex + 1}`,
          label: panel.label,
          positions: panel.endpoints.map((endpoint, endpointIndex) => {
            if (endpoint.variant === 'HOLDER') return null;
            return {
              id: `${deviceId}:bdfb:s${shelfIndex + 1}:f${frameIndex + 1}:p${panelIndex + 1}:e${endpointIndex + 1}`,
              label: endpoint.label,
              ...(endpoint.capacity === undefined ? {} : { capacity: endpoint.capacity }),
              ...(endpoint.rawPointId ? { telemetry: { rawPointId: endpoint.rawPointId } } : {}),
            };
          }),
        })),
      })),
    })),
  };
}
