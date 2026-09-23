import type { InventoryItem } from '@/modules/inventory/application/inventory-service';
import { InventoryService } from '@/modules/inventory/application/inventory-service';
import { initializeCas } from '@/modules/rack/domain/cas';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { CasRange, ContainerRackNode } from '@/modules/topology/domain/entities';
import { failure, success, type Result } from '@/shared/domain/result';

export type RackElevationError = 'RACK_NOT_FOUND' | 'NOT_A_RACK';

export type RackUnitRole = 'AVAILABLE' | 'PHYSICAL' | 'CLEARANCE' | 'RESERVED';

export interface RackElevationOccupant {
  readonly id: string;
  readonly kind: 'DEVICE' | 'EQUIPMENT';
  readonly name: string;
  readonly category?: string;
  readonly serialNumber?: string;
}

export interface RackElevationRow {
  readonly u: number;
  readonly state: CasRange['state'];
  readonly role: RackUnitRole;
  readonly allocationId: string;
  readonly occupant?: RackElevationOccupant;
}

export interface RackElevationView {
  readonly rack: ContainerRackNode;
  readonly inventory: readonly InventoryItem[];
  readonly rows: readonly RackElevationRow[];
}

function occupantView(item: InventoryItem): RackElevationOccupant {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    ...(item.category ? { category: item.category } : {}),
    ...(item.serialNumber ? { serialNumber: item.serialNumber } : {}),
  };
}

function roleFor(range: CasRange, u: number): RackUnitRole {
  if (range.state === 'AVAILABLE') {
    return 'AVAILABLE';
  }

  if (range.state === 'RESERVED') {
    const start = range.mountStartU;
    const size = range.physicalSizeU;

    if (start !== undefined && size !== undefined && u >= start && u < start + size) {
      return 'RESERVED';
    }

    return 'CLEARANCE';
  }

  const start = range.mountStartU;
  const size = range.physicalSizeU;

  if (start !== undefined && size !== undefined && u >= start && u < start + size) {
    return 'PHYSICAL';
  }

  return 'CLEARANCE';
}

export class RackElevationService {
  constructor(private readonly repository: TopologyRepository) {}

  async getView(rackId: string): Promise<Result<RackElevationView, RackElevationError>> {
    const node = await this.repository.getById(rackId);

    if (!node) {
      return failure('RACK_NOT_FOUND');
    }

    if (node.kind !== 'CONTAINER_RACK' || node.variant !== 'RACK' || !node.totalU) {
      return failure('NOT_A_RACK');
    }

    const inventoryResult = await new InventoryService(this.repository).listRackInventory(node.id);

    if (!inventoryResult.ok) {
      return failure('NOT_A_RACK');
    }

    const inventoryById = new Map(inventoryResult.value.map((item) => [item.id, item]));
    const ranges = node.cas.length > 0 ? node.cas : initializeCas(node.totalU);
    const rows: RackElevationRow[] = [];

    for (let u = node.totalU; u >= 1; u -= 1) {
      const range = ranges.find((candidate) => u >= candidate.startU && u <= candidate.endU);

      if (!range) {
        throw new Error(`CAS invariant broken for rack ${node.id} at U${u}.`);
      }

      const occupant = range.occupantId ? inventoryById.get(range.occupantId) : undefined;

      rows.push({
        u,
        state: range.state,
        role: roleFor(range, u),
        allocationId: range.id,
        ...(occupant ? { occupant: occupantView(occupant) } : {}),
      });
    }

    return success({
      rack: node,
      inventory: inventoryResult.value,
      rows,
    });
  }
}
