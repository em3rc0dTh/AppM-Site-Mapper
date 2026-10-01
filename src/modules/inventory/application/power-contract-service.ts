import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  AccessPort,
  DeviceNode,
  EquipmentNode,
  PowerRedundancyPolicy,
} from '@/modules/topology/domain/entities';
import { nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

type InventoryNode = DeviceNode | EquipmentNode;

export type PowerContractError =
  | 'ITEM_NOT_FOUND'
  | 'NOT_INVENTORY_ITEM'
  | 'INVALID_PORT'
  | 'DUPLICATE_PORT_ID'
  | 'DUPLICATE_PORT_LABEL'
  | 'INVALID_REDUNDANCY';

export interface UpdatePowerContractInput {
  readonly accessPorts: readonly AccessPort[];
  readonly redundancy: PowerRedundancyPolicy;
}

function normalizedPort(port: AccessPort): AccessPort | null {
  const id = port.id.trim();
  const label = port.label.trim();
  if (!id || !label || port.kind !== 'POWER') return null;
  if (port.feed !== undefined && port.feed !== 'A' && port.feed !== 'B') return null;
  return {
    id,
    label,
    kind: 'POWER',
    ...(port.feed ? { feed: port.feed } : {}),
  };
}

export class PowerContractService {
  constructor(private readonly repository: TopologyRepository) {}

  async update(
    id: string,
    input: UpdatePowerContractInput,
  ): Promise<Result<InventoryNode, PowerContractError>> {
    const node = await this.repository.getById(id);
    if (!node) return failure('ITEM_NOT_FOUND');
    if (node.kind !== 'DEVICE' && node.kind !== 'EQUIPMENT') {
      return failure('NOT_INVENTORY_ITEM');
    }

    if (input.redundancy !== 'NONE' && input.redundancy !== 'A_B_REQUIRED') {
      return failure('INVALID_REDUNDANCY');
    }

    const ports: AccessPort[] = [];
    for (const candidate of input.accessPorts) {
      const port = normalizedPort(candidate);
      if (!port) return failure('INVALID_PORT');
      ports.push(port);
    }

    const ids = new Set<string>();
    const labels = new Set<string>();
    for (const port of ports) {
      if (ids.has(port.id)) return failure('DUPLICATE_PORT_ID');
      const labelKey = port.label.toLowerCase();
      if (labels.has(labelKey)) return failure('DUPLICATE_PORT_LABEL');
      ids.add(port.id);
      labels.add(labelKey);
    }

    const updated: InventoryNode = {
      ...node,
      accessPorts: ports,
      powerRequirement: {
        redundancy: input.redundancy,
        ...(input.redundancy === 'A_B_REQUIRED' ? { requiredFeeds: ['A', 'B'] as const } : {}),
      },
      updatedAt: nowIso(),
    };

    await this.repository.replace(updated);
    return success(updated);
  }
}
