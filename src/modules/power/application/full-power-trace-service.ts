import type { PowerRepository } from '@/modules/power/application/power-repository';
import type { PowerFeed, PowerPath } from '@/modules/power/domain/entities';
import { resolvePowerEndpoint } from '@/modules/power/domain/endpoint-validation';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  AccessPort,
  DeviceNode,
  EquipmentNode,
  TopologyNode,
} from '@/modules/topology/domain/entities';

type InventoryNode = DeviceNode | EquipmentNode;

export type PowerTraceTopologyStatus =
  'VALID' | 'BROKEN_SOURCE' | 'BROKEN_TARGET' | 'LEGACY_TARGET_WITHOUT_PORT';

export type PowerTraceTelemetryStatus = 'LIVE' | 'MAPPED' | 'UNMAPPED';

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
    readonly accessPort?: AccessPort;
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

export class FullPowerTraceService {
  constructor(
    private readonly topology: TopologyRepository,
    private readonly power: PowerRepository,
    private readonly telemetry?: PowerTraceTelemetryReader,
  ) {}

  async resolve(rootId: string): Promise<FullPowerTrace | null> {
    const root = await this.topology.getById(rootId);
    if (!isInventoryNode(root) || root.lifecycle !== 'ACTIVE') return null;

    const family = await this.collectInventoryFamily(root);
    const familyIds = new Set(family.map((node) => node.id));
    const paths = (await this.power.listActive()).filter((path) =>
      familyIds.has(path.target.entityId),
    );

    const legs = await Promise.all(paths.map((path) => this.resolveLeg(path)));
    const policies = family.map((node) => this.resolvePolicy(node, legs));

    return {
      root: { id: root.id, name: root.name, kind: root.kind },
      legs,
      feedA: legs.filter((leg) => leg.feed === 'A'),
      feedB: legs.filter((leg) => leg.feed === 'B'),
      unspecified: legs.filter((leg) => !leg.feed),
      policies,
    };
  }

  private async collectInventoryFamily(root: InventoryNode): Promise<readonly InventoryNode[]> {
    const output: InventoryNode[] = [];
    const visited = new Set<string>();

    const visit = async (node: InventoryNode): Promise<void> => {
      if (visited.has(node.id)) return;
      visited.add(node.id);
      output.push(node);

      const children = await this.topology.listChildren(node.id);
      for (const child of children) {
        if (isInventoryNode(child) && child.lifecycle === 'ACTIVE') {
          await visit(child);
        }
      }
    };

    await visit(root);
    return output;
  }

  private async resolveLeg(path: PowerPath): Promise<FullPowerTraceLeg> {
    const [sourceOwner, targetOwner] = await Promise.all([
      this.topology.getById(path.source.entityId),
      this.topology.getById(path.target.entityId),
    ]);
    const source = resolvePowerEndpoint(sourceOwner, path.source);
    const target = resolvePowerEndpoint(targetOwner, path.target);

    const sourceResolved = source.ok ? source.value : null;
    const targetResolved = target.ok ? target.value : null;
    const breaker = sourceResolved?.breakerHolder;
    const targetPort = targetResolved?.accessPort;

    let topologyStatus: PowerTraceTopologyStatus = 'VALID';
    if (!source.ok || !breaker || breaker.variant !== 'BREAKER') {
      topologyStatus = 'BROKEN_SOURCE';
    } else if (!path.target.internal?.accessPortId) {
      topologyStatus = 'LEGACY_TARGET_WITHOUT_PORT';
    } else if (!target.ok || !targetPort) {
      topologyStatus = 'BROKEN_TARGET';
    }

    const hierarchy = isInventoryNode(targetOwner)
      ? await this.inventoryHierarchy(targetOwner)
      : [path.target.entityId];

    const latest = breaker ? this.telemetry?.latest(path.source.entityId) : null;
    const reading = latest?.breakerReadings?.find(
      (candidate) => candidate.breakerId === breaker?.id,
    );
    const rawPointId = breaker?.telemetry?.rawPointId ?? reading?.rawPointId;
    const telemetryStatus: PowerTraceTelemetryStatus = reading
      ? 'LIVE'
      : rawPointId
        ? 'MAPPED'
        : 'UNMAPPED';
    const voltageV = metricValue(reading?.metrics.voltageV);
    const currentA = metricValue(reading?.metrics.currentA);
    const powerW = metricValue(reading?.metrics.powerW);
    const energyKwh = metricValue(reading?.metrics.energyKwh);

    return {
      pathId: path.id,
      ...(path.label ? { label: path.label } : {}),
      ...(path.feed ? { feed: path.feed } : {}),
      topologyStatus,
      source: {
        entityId: path.source.entityId,
        entityName: sourceOwner?.name ?? path.source.entityId,
        ...(sourceResolved?.shelf ? { shelf: sourceResolved.shelf.label } : {}),
        ...(sourceResolved?.frame ? { frame: sourceResolved.frame.label } : {}),
        ...(sourceResolved?.panel ? { panel: sourceResolved.panel.label } : {}),
        ...(breaker ? { breakerId: breaker.id, breaker: breaker.label } : {}),
      },
      target: {
        entityId: path.target.entityId,
        entityName: targetOwner?.name ?? path.target.entityId,
        hierarchy,
        ...(targetPort ? { accessPort: targetPort } : {}),
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

  private async inventoryHierarchy(node: InventoryNode): Promise<readonly string[]> {
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
    node: InventoryNode,
    legs: readonly FullPowerTraceLeg[],
  ): PowerTracePolicyStatus {
    const policy = node.powerRequirement?.redundancy ?? 'NONE';
    const validFeeds = [
      ...new Set(
        legs
          .filter(
            (leg) =>
              leg.target.entityId === node.id &&
              leg.topologyStatus === 'VALID' &&
              (leg.feed === 'A' || leg.feed === 'B'),
          )
          .map((leg) => leg.feed as PowerFeed),
      ),
    ].sort();

    if (policy !== 'A_B_REQUIRED') {
      return {
        entityId: node.id,
        entityName: node.name,
        policy,
        status: 'NOT_DECLARED',
        feedsPresent: validFeeds,
      };
    }

    return {
      entityId: node.id,
      entityName: node.name,
      policy,
      status: validFeeds.includes('A') && validFeeds.includes('B') ? 'SATISFIED' : 'NOT_SATISFIED',
      feedsPresent: validFeeds,
    };
  }
}
