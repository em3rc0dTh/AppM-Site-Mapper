import type { PowerRepository } from '@/modules/power/application/power-repository';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  AccessPort,
  AccessPortDirection,
  AccessPortExposure,
  AccessPortType,
  EquipmentNode,
} from '@/modules/topology/domain/entities';
import { createDomainId, nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export interface AccessPortInput {
  readonly name: string;
  readonly portType: AccessPortType;
  readonly direction: AccessPortDirection;
  readonly exposure: AccessPortExposure;
  readonly connectorType?: string;
  readonly protocol?: string;
  readonly customType?: string;
  readonly feed?: 'A' | 'B';
}

export type AccessPortError =
  | 'NOT_FOUND'
  | 'NOT_EQUIPMENT'
  | 'EQUIPMENT_ARCHIVED'
  | 'PORT_NOT_FOUND'
  | 'PORT_IN_USE'
  | 'PORT_NAME_CONFLICT'
  | 'INVALID_PORT'
  | 'TOO_MANY_PORTS'
  | 'ATOMIC_LAYOUT_STORAGE_REQUIRED'
  | 'LAYOUT_CONFLICT';

function validText(value: string | undefined, max = 120): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= max);
}

function clean(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function valid(input: AccessPortInput): boolean {
  return (
    validText(input.name) &&
    input.name.trim().length > 0 &&
    ['POWER', 'NETWORK', 'CONTROL', 'DATA', 'GROUND', 'CUSTOM'].includes(input.portType) &&
    ['INPUT', 'OUTPUT', 'BIDIRECTIONAL'].includes(input.direction) &&
    ['INTERNAL', 'EXTERNAL'].includes(input.exposure) &&
    validText(input.connectorType) &&
    validText(input.protocol) &&
    validText(input.customType) &&
    (input.feed === undefined || (input.portType === 'POWER' && ['A', 'B'].includes(input.feed)))
  );
}

export class AccessPortService {
  constructor(
    private readonly topology: TopologyRepository,
    private readonly power: PowerRepository,
  ) {}

  async list(equipmentId: string): Promise<Result<readonly AccessPort[], AccessPortError>> {
    const node = await this.topology.getById(equipmentId);
    if (!node) return failure('NOT_FOUND');
    if (node.kind !== 'EQUIPMENT') return failure('NOT_EQUIPMENT');
    return success(node.accessPorts.filter((port) => port.lifecycle === 'ACTIVE'));
  }

  private async findEquipment(id: string): Promise<Result<EquipmentNode, AccessPortError>> {
    const node = await this.topology.getById(id);
    if (!node) return failure('NOT_FOUND');
    if (node.kind !== 'EQUIPMENT') return failure('NOT_EQUIPMENT');
    if (node.lifecycle !== 'ACTIVE') return failure('EQUIPMENT_ARCHIVED');
    return success(node);
  }

  private async linked(id: string): Promise<boolean> {
    const paths = await this.power.listForAccessPort(id);
    return paths.some((path) => path.lifecycle === 'ACTIVE');
  }

  async upsert(
    equipmentId: string,
    input: AccessPortInput,
    existingId?: string,
  ): Promise<Result<AccessPort, AccessPortError>> {
    if (!valid(input)) return failure('INVALID_PORT');
    const owner = await this.findEquipment(equipmentId);
    if (!owner.ok) return failure(owner.error);
    const node = owner.value;
    const existing = existingId
      ? node.accessPorts.find((port) => port.id === existingId && port.lifecycle === 'ACTIVE')
      : undefined;
    if (existingId && !existing) return failure('PORT_NOT_FOUND');
    if (!existing && node.accessPorts.filter((port) => port.lifecycle === 'ACTIVE').length >= 512)
      return failure('TOO_MANY_PORTS');

    if (node.accessPorts.some(
      (port) =>
        port.lifecycle === 'ACTIVE' &&
        port.id !== existingId &&
        port.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
    )) return failure('PORT_NAME_CONFLICT');

    const oldFeed = existing?.attributes?.feed;
    if (existing && await this.linked(existing.id)) {
      if (
        existing.portType !== input.portType ||
        existing.direction !== input.direction ||
        existing.exposure !== input.exposure ||
        oldFeed !== input.feed
      ) return failure('PORT_IN_USE');
    }

    const attributes: Record<string, unknown> = { ...(existing?.attributes ?? {}) };
    if (input.feed) attributes.feed = input.feed;
    else delete attributes.feed;

    const connectorType = clean(input.connectorType);
    const protocol = clean(input.protocol);
    const customType = clean(input.customType);
    const port: AccessPort = {
      id: existing?.id ?? createDomainId(),
      deviceId: node.deviceId,
      equipmentId: node.id,
      name: input.name.trim(),
      portType: input.portType,
      direction: input.direction,
      exposure: input.exposure,
      lifecycle: 'ACTIVE',
      ...(connectorType ? { connectorType } : {}),
      ...(protocol ? { protocol } : {}),
      ...(customType ? { customType } : {}),
      ...(Object.keys(attributes).length ? { attributes } : {}),
    };

    if (!this.topology.commitLayout) return failure('ATOMIC_LAYOUT_STORAGE_REQUIRED');
    const updated: EquipmentNode = {
      ...node,
      accessPorts: existing
        ? node.accessPorts.map((item) => item.id === existing.id ? port : item)
        : [...node.accessPorts, port],
      updatedAt: nowIso(),
    };
    if (!(await this.topology.commitLayout([node], [updated]))) return failure('LAYOUT_CONFLICT');
    return success(port);
  }

  async archive(
    equipmentId: string,
    portId: string,
  ): Promise<Result<AccessPort, AccessPortError>> {
    const owner = await this.findEquipment(equipmentId);
    if (!owner.ok) return failure(owner.error);
    const node = owner.value;
    const current = node.accessPorts.find((port) => port.id === portId && port.lifecycle === 'ACTIVE');
    if (!current) return failure('PORT_NOT_FOUND');
    if (await this.linked(current.id)) return failure('PORT_IN_USE');
    if (!this.topology.commitLayout) return failure('ATOMIC_LAYOUT_STORAGE_REQUIRED');

    const archived: AccessPort = { ...current, lifecycle: 'ARCHIVED' };
    const updated: EquipmentNode = {
      ...node,
      accessPorts: node.accessPorts.map((port) => port.id === portId ? archived : port),
      updatedAt: nowIso(),
    };
    if (!(await this.topology.commitLayout([node], [updated]))) return failure('LAYOUT_CONFLICT');
    return success(archived);
  }
}
