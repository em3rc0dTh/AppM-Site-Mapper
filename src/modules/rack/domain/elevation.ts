import type { CasRange } from '@/modules/topology/domain/entities';
import type { InventoryKind } from '@/modules/inventory/domain/occupant';

export type RackUnitRole = 'AVAILABLE' | 'PHYSICAL' | 'CLEARANCE';

export interface RackElevationOccupant {
  readonly id: string;
  readonly kind: InventoryKind;
  readonly name: string;
}

export interface RackElevationUnit {
  readonly u: number;
  readonly state: CasRange['state'];
  readonly role: RackUnitRole;
  readonly allocationId: string;
  readonly occupant?: RackElevationOccupant;
}

export interface RackElevationProjection {
  readonly rackId: string;
  readonly rackName: string;
  readonly totalU: number;
  readonly units: readonly RackElevationUnit[];
}

export function projectRackElevation(
  rackId: string,
  rackName: string,
  totalU: number,
  ranges: readonly CasRange[],
  occupants: ReadonlyMap<string, RackElevationOccupant>,
): RackElevationProjection {
  const units: RackElevationUnit[] = [];

  for (let u = totalU; u >= 1; u -= 1) {
    const range = ranges.find((candidate) => candidate.startU <= u && candidate.endU >= u);

    if (!range) {
      throw new Error(`CAS coverage missing for U${u}.`);
    }

    const physicalStart = range.mountStartU;
    const physicalEnd =
      physicalStart !== undefined && range.physicalSizeU !== undefined
        ? physicalStart + range.physicalSizeU - 1
        : undefined;

    const role: RackUnitRole =
      range.state === 'AVAILABLE'
        ? 'AVAILABLE'
        : physicalStart !== undefined &&
            physicalEnd !== undefined &&
            u >= physicalStart &&
            u <= physicalEnd
          ? 'PHYSICAL'
          : 'CLEARANCE';

    const occupant = range.occupantId ? occupants.get(range.occupantId) : undefined;

    units.push({
      u,
      state: range.state,
      role,
      allocationId: range.id,
      ...(occupant ? { occupant } : {}),
    });
  }

  return { rackId, rackName, totalU, units };
}
