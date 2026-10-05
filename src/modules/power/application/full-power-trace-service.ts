import type { PowerRepository } from '@/modules/power/application/power-repository';
import { resolvePowerEndpoint } from '@/modules/power/domain/endpoint-validation';
import type { PowerFeed, PowerPath } from '@/modules/power/domain/entities';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  AccessPort,
  DeviceNode,
  EquipmentNode,
  TopologyNode,
} from '@/modules/topology/domain/entities';

type InventoryNode = DeviceNode | EquipmentNode;

export type PowerTraceTopologyStatus = 'VALID' | 'BROKEN_SOURCE' | 'BROKEN_TARGET';
export type PowerTraceTelemetryStatus = 'LIVE' | 'MAPPED' | 'UNMAPPED';

export interface PowerTraceAccessPortView {
  readonly id: string;
  readonly label: string;
  readonly feed?: PowerFeed;
}

export interface FullPowerTraceLeg {
  readonly pathId: string;
  readonly label?: string;
  readonly feed?: PowerFeed;
  readonly topologyStatus: PowerTraceTopologyStatus;
  readonly source: {
    readonly entityId: string;
    readonly entityName: string;
    readonly shelf?: string;
    readonly frame?: string;
    readonly panel?: string;
    readonly breakerId?: string;
    readonly breaker?: string;
  };
  readonly target: {
    readonly entityId: string;
    readonly entityName: string;
    readonly hierarchy: readonly string[];
    readonly accessPort?: PowerTraceAccessPortView;
  };
  readonly telemetry: {
    readonly status: PowerTraceTelemetryStatus;
    readonly rawPointId?: string;
    readonly sourceIdentity?: string;
    readonly receivedAt?: string;
    readonly voltageV?: number;
    readonly currentA?: number;
    readonly powerW?: number;
    readonly energyKwh?: number;
  };
}

export interface PowerTracePolicyStatus {
  readonly entityId: string;
  readonly entityName: string;
  readonly policy: 'NONE' | 'A_B_REQUIRED';
  readonly status: 'NOT_DECLARED' | 'SATISFIED' | 'NOT_SATISFIED';
  readonly feedsPresent: readonly PowerFeed[];
}

export interface FullPowerTrace {
  readonly root: {
    readonly id: string;
    readonly name: string;
    readonly kind: 'DEVICE' | 'EQUIPMENT';
  };
  readonly legs: readonly FullPowerTraceLeg[];
  readonly feedA: readonly FullPowerTraceLeg[];
  readonly feedB: readonly FullPowerTraceLeg[];
  readonly unspecified: readonly FullPowerTraceLeg[];
  readonly policies: readonly PowerTracePolicyStatus[];
}

export interface PowerTraceTelemetryReader {
  latest(entityId: string): TelemetrySample | null;
}

function isInventoryNode(node: TopologyNode | null): node is InventoryNode {
  return Boolean(node && (node.kind === 'DEVICE' || node.kind === 'EQUIPMENT'));
}

function metricValue(value: { readonly value: number } | undefined): number | undefined {
  return value?.value;
}

function stringAttribute(node: EquipmentNode, key: string): string | undefined {
  const value = node.attributes?.[key];
  return typeof value === 'string' ? value : undefined;
}

function feedOf(port: AccessPort): PowerFeed | undefined {
  const value = port.attributes?.feed;
  return value === 'A' || value === 'B' ? value : undefined;
}

export class FullPowerTraceService {
  constructor(
    private readonly topology: TopologyRepository,
    private readonly power: PowerRepository,
    private readonly telemetry?: PowerTraceTelemetryReader,
  ) {}

  async resolve(rootId: string): Promise<FullPowerTrace | null> {
    const root = await this.topology.getById(rootId);
    if (!isInventoryNode(root) || root.lifecycle !== 'ACTIVE') return null;

    const family = await this.collectFamily(root);
    const familyEquipment = family.filter(
      (node): node is EquipmentNode => node.kind === 'EQUIPMENT',
    );
    const targetPortIds = new Set(
      familyEquipment.flatMap((node) =>
        node.accessPorts.filter((port) => port.lifecycle === 'ACTIVE').map((port) => port.id),
      ),
    );

    const paths = (await this.power.listActive()).filter((path) =>
      targetPortIds.has(path.targetAccessPortId),
    );
    const legs = await Promise.all(paths.map((path) => this.resolveLeg(path)));
    const policy = this.resolvePolicy(root, familyEquipment, legs);

    return {
      root: { id: root.id, name: root.name, kind: root.kind },
      legs,
      feedA: legs.filter((leg) => leg.feed === 'A'),
      feedB: legs.filter((leg) => leg.feed === 'B'),
      unspecified: legs.filter((leg) => !leg.feed),
      policies: [policy],
    };
  }

  private async collectFamily(root: InventoryNode): Promise<readonly InventoryNode[]> {
    if (root.kind === 'DEVICE') {
      const equipment = (await this.topology.listEquipmentForDevice(root.id)).filter(
        (item) => item.lifecycle === 'ACTIVE',
      );
      return [root, ...equipment];
    }

    const device = await this.topology.getById(root.deviceId);
    const equipment = (await this.topology.listEquipmentForDevice(root.deviceId)).filter(
      (item) => item.lifecycle === 'ACTIVE',
    );
    return device?.kind === 'DEVICE' && device.lifecycle === 'ACTIVE'
      ? [device, ...equipment]
      : equipment;
  }

  private async resolveLeg(path: PowerPath): Promise<FullPowerTraceLeg> {
    const [source, target] = await Promise.all([
      resolvePowerEndpoint(this.topology, path.sourceAccessPortId),
      resolvePowerEndpoint(this.topology, path.targetAccessPortId),
    ]);

    const sourceEquipment = source?.equipment;
    const targetEquipment = target?.equipment;
    const sourceDevice = sourceEquipment
      ? await this.topology.getById(sourceEquipment.deviceId)
      : null;
    const sourceHierarchy = sourceEquipment
      ? await this.equipmentHierarchy(sourceEquipment)
      : { shelf: undefined, frame: undefined, panel: undefined };
    const targetHierarchy = targetEquipment
      ? await this.inventoryHierarchy(targetEquipment)
      : [path.targetAccessPortId];

    const isBreaker = sourceEquipment?.equipmentType === 'CIRCUIT_BREAKER';
    const latest =
      sourceEquipment && isBreaker ? this.telemetry?.latest(sourceEquipment.deviceId) : null;
    const reading =
      sourceEquipment && isBreaker
        ? latest?.breakerReadings?.find((candidate) => candidate.breakerId === sourceEquipment.id)
        : undefined;
    const rawPointId =
      (sourceEquipment ? stringAttribute(sourceEquipment, 'telemetryRawPointId') : undefined) ??
      reading?.rawPointId;
    const targetFeed = target?.port ? feedOf(target.port) : undefined;
    const voltageV = metricValue(reading?.metrics.voltageV);
    const currentA = metricValue(reading?.metrics.currentA);
    const powerW = metricValue(reading?.metrics.powerW);
    const energyKwh = metricValue(reading?.metrics.energyKwh);
    const telemetryStatus: PowerTraceTelemetryStatus = reading
      ? 'LIVE'
      : rawPointId
        ? 'MAPPED'
        : 'UNMAPPED';

    return {
      pathId: path.id,
      ...(path.label ? { label: path.label } : {}),
      ...(path.feed ? { feed: path.feed } : {}),
      topologyStatus: !source || !isBreaker ? 'BROKEN_SOURCE' : !target ? 'BROKEN_TARGET' : 'VALID',
      source: {
        entityId: sourceEquipment?.deviceId ?? path.sourceAccessPortId,
        entityName: sourceDevice?.name ?? sourceEquipment?.name ?? path.sourceAccessPortId,
        ...(sourceHierarchy.shelf ? { shelf: sourceHierarchy.shelf } : {}),
        ...(sourceHierarchy.frame ? { frame: sourceHierarchy.frame } : {}),
        ...(sourceHierarchy.panel ? { panel: sourceHierarchy.panel } : {}),
        ...(sourceEquipment && isBreaker
          ? { breakerId: sourceEquipment.id, breaker: sourceEquipment.name }
          : {}),
      },
      target: {
        entityId: targetEquipment?.id ?? path.targetAccessPortId,
        entityName: targetEquipment?.name ?? path.targetAccessPortId,
        hierarchy: targetHierarchy,
        ...(target?.port
          ? {
              accessPort: {
                id: target.port.id,
                label: target.port.name,
                ...(targetFeed ? { feed: targetFeed } : {}),
              },
            }
          : {}),
      },
      telemetry: {
        status: telemetryStatus,
        ...(rawPointId ? { rawPointId } : {}),
        ...(reading?.sourceIdentity ? { sourceIdentity: reading.sourceIdentity } : {}),
        ...(reading?.receivedAt ? { receivedAt: reading.receivedAt } : {}),
        ...(voltageV !== undefined ? { voltageV } : {}),
        ...(currentA !== undefined ? { currentA } : {}),
        ...(powerW !== undefined ? { powerW } : {}),
        ...(energyKwh !== undefined ? { energyKwh } : {}),
      },
    };
  }

  private async equipmentHierarchy(
    node: EquipmentNode,
  ): Promise<{ shelf?: string; frame?: string; panel?: string }> {
    let current: EquipmentNode | null = node;
    const visited = new Set<string>();
    let shelf: string | undefined;
    let frame: string | undefined;
    let panel: string | undefined;

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.equipmentType === 'SHELF') shelf = current.name;
      if (current.equipmentType === 'FRAME') frame = current.name;
      if (current.equipmentType === 'PANEL') panel = current.name;
      if (!current.parentEquipmentId) break;
      const parent = await this.topology.getById(current.parentEquipmentId);
      current = parent?.kind === 'EQUIPMENT' ? parent : null;
    }

    return {
      ...(shelf ? { shelf } : {}),
      ...(frame ? { frame } : {}),
      ...(panel ? { panel } : {}),
    };
  }

  private async inventoryHierarchy(node: EquipmentNode): Promise<readonly string[]> {
    const names: string[] = [];
    const visited = new Set<string>();
    let current: TopologyNode | null = node;

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      names.unshift(current.name);
      if (!current.parentId) break;
      current = await this.topology.getById(current.parentId);
      if (current?.kind === 'CONTAINER_RACK') {
        names.unshift(current.name);
        break;
      }
    }
    return names;
  }

  private resolvePolicy(
    root: InventoryNode,
    family: readonly EquipmentNode[],
    legs: readonly FullPowerTraceLeg[],
  ): PowerTracePolicyStatus {
    const policyEquipment =
      root.kind === 'EQUIPMENT'
        ? root
        : (family.find((item) => item.attributes?.powerContractRoot === true) ??
          family.find((item) => item.attributes?.powerRedundancy === 'A_B_REQUIRED'));
    const policy =
      policyEquipment?.attributes?.powerRedundancy === 'A_B_REQUIRED' ? 'A_B_REQUIRED' : 'NONE';
    const targetIds = new Set(family.map((item) => item.id));
    const validFeeds = [
      ...new Set(
        legs
          .filter(
            (leg) =>
              targetIds.has(leg.target.entityId) &&
              leg.topologyStatus === 'VALID' &&
              (leg.feed === 'A' || leg.feed === 'B'),
          )
          .map((leg) => leg.feed as PowerFeed),
      ),
    ].sort() as PowerFeed[];

    return {
      entityId: root.id,
      entityName: root.name,
      policy,
      status:
        policy !== 'A_B_REQUIRED'
          ? 'NOT_DECLARED'
          : validFeeds.includes('A') && validFeeds.includes('B')
            ? 'SATISFIED'
            : 'NOT_SATISFIED',
      feedsPresent: validFeeds,
    };
  }
}
