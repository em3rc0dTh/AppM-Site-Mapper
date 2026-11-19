import {
  parseDeclaredPowerTarget,
  type PoweredEquipmentEndpoint,
} from '@/modules/power/domain/powered-equipment';
import type { PowerFeed } from '@/modules/power/domain/entities';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { DeviceNode, EquipmentNode, TopologyNode } from '@/modules/topology/domain/entities';

export interface PoweredEquipmentConnection {
  readonly breakerId: string;
  readonly breakerName: string;
  readonly panelId?: string;
  readonly panelName: string;
  readonly qdfName: string;
  readonly feed?: PowerFeed;
  readonly endpoint: PoweredEquipmentEndpoint;
}

export interface PoweredEquipmentProjection {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly connections: readonly PoweredEquipmentConnection[];
  readonly qdfs: readonly string[];
  readonly feeds: readonly PowerFeed[];
}

type DeclaredPowerMetadata = {
  readonly qdf?: string;
  readonly feed?: PowerFeed;
};

function declaredPowerMetadata(value: unknown): DeclaredPowerMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const qdf = typeof record.qdf === 'string' && record.qdf.trim() ? record.qdf.trim() : undefined;
  const feed = record.feed === 'A' || record.feed === 'B' ? record.feed : undefined;
  return {
    ...(qdf ? { qdf } : {}),
    ...(feed ? { feed } : {}),
  };
}

function panelFeed(panelName: string): PowerFeed | undefined {
  const normalized = panelName.trim().toUpperCase();
  if (/^A(?:\d|\b|[-_ ])/.test(normalized)) return 'A';
  if (/^B(?:\d|\b|[-_ ])/.test(normalized)) return 'B';
  return undefined;
}

function isActiveEquipment(node: TopologyNode): node is EquipmentNode {
  return node.kind === 'EQUIPMENT' && node.lifecycle === 'ACTIVE';
}

function isActiveDevice(node: TopologyNode): node is DeviceNode {
  return node.kind === 'DEVICE' && node.lifecycle === 'ACTIVE';
}

function compareConnections(
  left: PoweredEquipmentConnection,
  right: PoweredEquipmentConnection,
): number {
  return (
    left.qdfName.localeCompare(right.qdfName) ||
    (left.feed ?? '').localeCompare(right.feed ?? '') ||
    left.panelName.localeCompare(right.panelName) ||
    left.breakerName.localeCompare(right.breakerName) ||
    left.endpoint.aid.localeCompare(right.endpoint.aid)
  );
}

/**
 * Read-only projection over the existing breaker declarations.
 *
 * It deliberately does not create topology nodes, mutate aliases or change PowerPath.
 * Existing POWER_TARGET behavior remains authoritative for the individual declaration;
 * this projection only groups those declarations by their logical powered equipment.
 */
export class PoweredEquipmentProjectionService {
  constructor(private readonly topology: TopologyRepository) {}

  async list(): Promise<readonly PoweredEquipmentProjection[]> {
    const [equipmentNodes, deviceNodes] = await Promise.all([
      this.topology.listByKind('EQUIPMENT'),
      this.topology.listByKind('DEVICE'),
    ]);
    const equipment = equipmentNodes.filter(isActiveEquipment);
    const devices = deviceNodes.filter(isActiveDevice);
    const byId = new Map<string, TopologyNode>([
      ...equipment.map((node) => [node.id, node] as const),
      ...devices.map((node) => [node.id, node] as const),
    ]);

    const groups = new Map<
      string,
      {
        name: string;
        connections: PoweredEquipmentConnection[];
        seen: Set<string>;
      }
    >();

    for (const breaker of equipment) {
      if (breaker.equipmentType !== 'CIRCUIT_BREAKER') continue;

      const metadata = declaredPowerMetadata(breaker.attributes?.declaredPower);
      const panel = breaker.parentEquipmentId ? byId.get(breaker.parentEquipmentId) : null;
      const panelName = panel?.kind === 'EQUIPMENT' ? panel.name : 'Panel';
      const sourceDevice = byId.get(breaker.deviceId);
      const qdfName =
        metadata.qdf ??
        (sourceDevice?.kind === 'DEVICE' ? sourceDevice.name : undefined) ??
        breaker.deviceId;

      for (const alias of breaker.aliases ?? []) {
        const endpoint = parseDeclaredPowerTarget(alias);
        if (!endpoint) continue;

        const feed = metadata.feed ?? endpoint.side ?? panelFeed(panelName);
        const group =
          groups.get(endpoint.equipmentKey) ??
          {
            name: endpoint.equipmentName,
            connections: [],
            seen: new Set<string>(),
          };
        const dedupeKey = `${breaker.id}\u0000${endpoint.aid}`;
        if (group.seen.has(dedupeKey)) continue;
        group.seen.add(dedupeKey);
        group.connections.push({
          breakerId: breaker.id,
          breakerName: breaker.name,
          ...(panel?.kind === 'EQUIPMENT' ? { panelId: panel.id } : {}),
          panelName,
          qdfName,
          ...(feed ? { feed } : {}),
          endpoint,
        });
        groups.set(endpoint.equipmentKey, group);
      }
    }

    return [...groups.entries()]
      .map(([key, group]) => {
        const connections = [...group.connections].sort(compareConnections);
        const qdfs = [...new Set(connections.map((connection) => connection.qdfName))].sort();
        const feeds = [...new Set(connections.flatMap((connection) => (connection.feed ? [connection.feed] : [])))].sort() as PowerFeed[];
        return {
          id: `powered-equipment:${key}`,
          key,
          name: group.name,
          connections,
          qdfs,
          feeds,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name) || left.key.localeCompare(right.key));
  }

  async getByKey(key: string): Promise<PoweredEquipmentProjection | null> {
    const normalized = key.trim().toLocaleLowerCase();
    if (!normalized) return null;
    return (await this.list()).find((equipment) => equipment.key === normalized) ?? null;
  }
}
