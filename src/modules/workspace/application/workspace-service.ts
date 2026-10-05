import type { PowerRepository } from '@/modules/power/application/power-repository';
import { BdfbProjectionService } from '@/modules/power/application/bdfb-projection-service';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { DeviceNode, EquipmentNode, TopologyNode } from '@/modules/topology/domain/entities';

export interface WorkspaceTreeNode {
  readonly id: string;
  readonly name: string;
  readonly kind: TopologyNode['kind'];
  readonly href: string;
  readonly children: readonly WorkspaceTreeNode[];
}

export interface WorkspacePinnedItem {
  readonly id: string;
  readonly name: string;
  readonly kind: 'DEVICE' | 'EQUIPMENT';
  readonly serialNumber?: string;
  readonly category?: string;
  readonly href: string;
}

export interface WorkspaceNotification {
  readonly id: string;
  readonly severity: 'INFO' | 'WARNING';
  readonly title: string;
  readonly message: string;
  readonly entityId?: string;
}

export interface WorkspaceBdfbSummary {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly shelves: number;
  readonly frames: number;
  readonly panels: number;
  readonly endpoints: number;
  readonly href: string;
}

export interface WorkspaceSnapshot {
  readonly navigation: readonly WorkspaceTreeNode[];
  readonly pinned: readonly WorkspacePinnedItem[];
  readonly notifications: readonly WorkspaceNotification[];
  readonly bdfb: readonly WorkspaceBdfbSummary[];
  readonly activePowerPaths: number;
}

type InventoryNode = DeviceNode | EquipmentNode;

export class WorkspaceService {
  private readonly topologyService: TopologyService;
  private readonly bdfbProjection: BdfbProjectionService;

  constructor(
    private readonly topology: TopologyRepository,
    private readonly power: PowerRepository,
  ) {
    this.topologyService = new TopologyService(topology);
    this.bdfbProjection = new BdfbProjectionService(topology);
  }

  async getSnapshot(): Promise<WorkspaceSnapshot> {
    const [networks, devices, equipment, powerPaths] = await Promise.all([
      this.topology.listByKind('NETWORK'),
      this.topology.listByKind('DEVICE'),
      this.topology.listByKind('EQUIPMENT'),
      this.power.listActive(),
    ]);

    const activeNetworks = networks.filter((node) => node.lifecycle === 'ACTIVE');
    const inventory = [...devices, ...equipment].filter(
      (node): node is InventoryNode =>
        (node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') && node.lifecycle === 'ACTIVE',
    );

    return {
      navigation: await Promise.all(activeNetworks.map((network) => this.buildTree(network))),
      pinned: await this.buildPinned(inventory),
      notifications: this.buildNotifications(inventory),
      bdfb: await this.buildBdfbSummaries(
        inventory.filter((node): node is DeviceNode => node.kind === 'DEVICE'),
      ),
      activePowerPaths: powerPaths.length,
    };
  }

  private async buildTree(node: TopologyNode): Promise<WorkspaceTreeNode> {
    const children = (await this.topology.listChildren(node.id)).filter(
      (child) => child.lifecycle === 'ACTIVE',
    );

    return {
      id: node.id,
      name: node.name,
      kind: node.kind,
      href: await this.topologyService.buildDeepLink(node.id),
      children: await Promise.all(children.map((child) => this.buildTree(child))),
    };
  }

  private async buildPinned(
    inventory: readonly InventoryNode[],
  ): Promise<readonly WorkspacePinnedItem[]> {
    const pinned = inventory
      .filter((item) => item.pinned)
      .sort((left, right) => left.name.localeCompare(right.name));

    return Promise.all(
      pinned.map(async (item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        ...(item.serialNumber ? { serialNumber: item.serialNumber } : {}),
        ...(item.category ? { category: item.category } : {}),
        href: await this.topologyService.buildDeepLink(item.id),
      })),
    );
  }

  private buildNotifications(
    inventory: readonly InventoryNode[],
  ): readonly WorkspaceNotification[] {
    return inventory
      .filter((item) => !item.serialNumber?.trim())
      .map((item) => ({
        id: `telemetry-identity-${item.id}`,
        severity: 'WARNING' as const,
        title: 'Telemetry identity missing',
        message: `${item.name} cannot be matched to realtime telemetry until a serial number is assigned.`,
        entityId: item.id,
      }))
      .sort((left, right) => left.message.localeCompare(right.message));
  }

  private async buildBdfbSummaries(
    devices: readonly DeviceNode[],
  ): Promise<readonly WorkspaceBdfbSummary[]> {
    const summaries = await Promise.all(
      devices
        .filter((device) => device.deviceType === 'BDFB')
        .map(async (device) => {
          const presentation = await this.bdfbProjection.get(device.id);
          if (!presentation) return null;

          const frames = presentation.shelves.flatMap((shelf) => shelf.frames);
          const panels = frames.flatMap((frame) => frame.panels);
          const endpoints = panels.flatMap((panel) => panel.positions).filter(Boolean);

          return {
            deviceId: device.id,
            deviceName: device.name,
            shelves: presentation.shelves.length,
            frames: frames.length,
            panels: panels.length,
            endpoints: endpoints.length,
            href: await this.topologyService.buildDeepLink(device.id),
          };
        }),
    );

    return summaries.filter(
      (summary): summary is WorkspaceBdfbSummary => summary !== null,
    );
  }
}
