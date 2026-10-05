import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { AccessPort, DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { createDomainId, nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type PowerRedundancyPolicy = 'NONE' | 'A_B_REQUIRED';
export type PowerFeedIdentity = 'A' | 'B';

export interface PowerContractPortInput {
  readonly id: string;
  readonly label: string;
  readonly feed?: PowerFeedIdentity;
}

export interface PowerContractView {
  readonly ownerId: string;
  readonly equipmentId: string;
  readonly accessPorts: readonly PowerContractPortInput[];
  readonly redundancy: PowerRedundancyPolicy;
}

export type PowerContractError =
  | 'ITEM_NOT_FOUND'
  | 'NOT_INVENTORY_ITEM'
  | 'INVALID_PORT'
  | 'DUPLICATE_PORT_ID'
  | 'DUPLICATE_PORT_LABEL'
  | 'INVALID_REDUNDANCY';

export interface UpdatePowerContractInput {
  readonly accessPorts: readonly PowerContractPortInput[];
  readonly redundancy: PowerRedundancyPolicy;
}

function feedOf(port: AccessPort): PowerFeedIdentity | undefined {
  const value = port.attributes?.feed;
  return value === 'A' || value === 'B' ? value : undefined;
}

function redundancyOf(equipment: EquipmentNode): PowerRedundancyPolicy {
  return equipment.attributes?.powerRedundancy === 'A_B_REQUIRED' ? 'A_B_REQUIRED' : 'NONE';
}

function toView(ownerId: string, equipment: EquipmentNode): PowerContractView {
  return {
    ownerId,
    equipmentId: equipment.id,
    accessPorts: equipment.accessPorts
      .filter(
        (port) =>
          port.lifecycle === 'ACTIVE' &&
          port.portType === 'POWER' &&
          port.exposure === 'EXTERNAL' &&
          port.direction !== 'OUTPUT',
      )
      .map((port) => ({
        id: port.id,
        label: port.name,
        ...(feedOf(port) ? { feed: feedOf(port) } : {}),
      })),
    redundancy: redundancyOf(equipment),
  };
}

export class PowerContractService {
  constructor(private readonly repository: TopologyRepository) {}

  async get(id: string): Promise<Result<PowerContractView, PowerContractError>> {
    const node = await this.repository.getById(id);
    if (!node) return failure('ITEM_NOT_FOUND');
    if (node.kind !== 'DEVICE' && node.kind !== 'EQUIPMENT') return failure('NOT_INVENTORY_ITEM');

    const equipment = await this.findContractEquipment(node);
    return success(
      equipment
        ? toView(node.id, equipment)
        : { ownerId: node.id, equipmentId: '', accessPorts: [], redundancy: 'NONE' },
    );
  }

  async update(
    id: string,
    input: UpdatePowerContractInput,
  ): Promise<Result<PowerContractView, PowerContractError>> {
    const node = await this.repository.getById(id);
    if (!node) return failure('ITEM_NOT_FOUND');
    if (node.kind !== 'DEVICE' && node.kind !== 'EQUIPMENT') {
      return failure('NOT_INVENTORY_ITEM');
    }

    if (input.redundancy !== 'NONE' && input.redundancy !== 'A_B_REQUIRED') {
      return failure('INVALID_REDUNDANCY');
    }

    const normalized: PowerContractPortInput[] = [];
    for (const candidate of input.accessPorts) {
      const port = {
        id: candidate.id.trim(),
        label: candidate.label.trim(),
        ...(candidate.feed ? { feed: candidate.feed } : {}),
      };
      if (!port.id || !port.label || (port.feed && port.feed !== 'A' && port.feed !== 'B')) {
        return failure('INVALID_PORT');
      }
      normalized.push(port);
    }

    const ids = new Set<string>();
    const labels = new Set<string>();
    for (const port of normalized) {
      if (ids.has(port.id)) return failure('DUPLICATE_PORT_ID');
      const labelKey = port.label.toLowerCase();
      if (labels.has(labelKey)) return failure('DUPLICATE_PORT_LABEL');
      ids.add(port.id);
      labels.add(labelKey);
    }

    const equipment = await this.ensureContractEquipment(node);
    const preserved = equipment.accessPorts.filter(
      (port) =>
        !(
          port.portType === 'POWER' &&
          port.exposure === 'EXTERNAL' &&
          port.direction !== 'OUTPUT'
        ),
    );
    const ports: AccessPort[] = normalized.map((port) => ({
      id: port.id,
      deviceId: equipment.deviceId,
      equipmentId: equipment.id,
      name: port.label,
      portType: 'POWER',
      direction: 'INPUT',
      exposure: 'EXTERNAL',
      lifecycle: 'ACTIVE',
      ...(port.feed ? { attributes: { feed: port.feed } } : {}),
    }));

    const updated: EquipmentNode = {
      ...equipment,
      accessPorts: [...preserved, ...ports],
      attributes: {
        ...(equipment.attributes ?? {}),
        powerContractRoot: true,
        powerRedundancy: input.redundancy,
        ...(input.redundancy === 'A_B_REQUIRED' ? { requiredFeeds: ['A', 'B'] } : {}),
      },
      updatedAt: nowIso(),
    };
    await this.repository.replace(updated);
    return success(toView(node.id, updated));
  }

  private async findContractEquipment(
    node: DeviceNode | EquipmentNode,
  ): Promise<EquipmentNode | null> {
    if (node.kind === 'EQUIPMENT') return node;

    const equipment = await this.repository.listEquipmentForDevice(node.id);
    const roots = new Set(Array.isArray(node.rootEquipmentIds) ? node.rootEquipmentIds : []);
    return
      equipment.find(
        (item) =>
          item.lifecycle === 'ACTIVE' &&
          roots.has(item.id) &&
          item.attributes?.powerContractRoot === true,
      ) ??
      equipment.find(
        (item) =>
          item.lifecycle === 'ACTIVE' &&
          roots.has(item.id) &&
          item.accessPorts.some(
            (port) =>
              port.lifecycle === 'ACTIVE' &&
              port.portType === 'POWER' &&
              port.exposure === 'EXTERNAL' &&
              port.direction !== 'OUTPUT',
          ),
      ) ??
      equipment.find((item) => item.lifecycle === 'ACTIVE' && roots.has(item.id)) ??
      null;
  }

  private async ensureContractEquipment(
    node: DeviceNode | EquipmentNode,
  ): Promise<EquipmentNode> {
    const existing = await this.findContractEquipment(node);
    if (existing) return existing;
    if (node.kind === 'EQUIPMENT') return node;

    const timestamp = nowIso();
    const id = createDomainId();
    const created: EquipmentNode = {
      id,
      kind: 'EQUIPMENT',
      parentId: node.id,
      deviceId: node.id,
      equipmentType: 'POWER_MODULE',
      parentEquipmentId: null,
      childMode: 'DYNAMIC',
      children: [],
      accessPorts: [],
      name: node.name + ' Power Interface',
      pinned: false,
      attributes: { powerContractRoot: true, powerRedundancy: 'NONE' },
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.repository.insert(created);
    await this.repository.replace({
      ...node,
      rootEquipmentIds: [...(node.rootEquipmentIds ?? []), created.id],
      updatedAt: timestamp,
    });
    return created;
  }
}
