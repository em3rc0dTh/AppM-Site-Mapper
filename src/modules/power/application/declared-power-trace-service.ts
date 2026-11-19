import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { EquipmentNode } from '@/modules/topology/domain/entities';

export type DeclaredPowerTraceFeed = {
  readonly feed: 'A' | 'B';
  readonly breakerId: string;
  readonly breakerName: string;
  readonly panelName: string;
  readonly qdfName: string;
  readonly targetLabel: string;
  readonly targetAid?: string;
  readonly targetLocalAid?: string;
};

export type DeclaredPowerTrace = {
  readonly selectedBreakerId: string;
  readonly pairId?: string;
  readonly targetLabel: string;
  readonly targetEntityName: string;
  readonly targetCanonicalEntityName: string;
  readonly targetKind: 'EQUIPMENT' | 'PDU';
  readonly targetRackAid?: string;
  readonly selectedTargetAid?: string;
  readonly selectedTargetLocalAid?: string;
  readonly feedA?: DeclaredPowerTraceFeed;
  readonly feedB?: DeclaredPowerTraceFeed;
};

type DeclaredPowerMetadata = {
  readonly qdf?: string;
  readonly pairId?: string;
  readonly feed?: 'A' | 'B';
  readonly targetLabel?: string;
  readonly targetEntityName?: string;
  readonly targetCanonicalEntityName?: string;
  readonly targetKind?: 'EQUIPMENT' | 'PDU';
  readonly targetAid?: string;
  readonly targetLocalAid?: string;
  readonly targetRackAid?: string;
  readonly companionFeed?: {
    readonly breakerId: string;
    readonly feed: 'A' | 'B';
    readonly panel: string;
    readonly position: number;
    readonly targetLabel: string;
  };
};

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function metadata(value: unknown): DeclaredPowerMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const feed = record.feed === 'A' || record.feed === 'B' ? record.feed : undefined;
  const targetKind =
    record.targetKind === 'EQUIPMENT' || record.targetKind === 'PDU'
      ? record.targetKind
      : undefined;

  let companionFeed: DeclaredPowerMetadata['companionFeed'];
  const rawCompanion = record.companionFeed;
  if (rawCompanion && typeof rawCompanion === 'object' && !Array.isArray(rawCompanion)) {
    const companion = rawCompanion as Record<string, unknown>;
    const companionFeedValue =
      companion.feed === 'A' || companion.feed === 'B' ? companion.feed : undefined;
    const breakerId = stringValue(companion.breakerId);
    const panel = stringValue(companion.panel);
    const targetLabel = stringValue(companion.targetLabel);
    const position =
      typeof companion.position === 'number' && Number.isFinite(companion.position)
        ? companion.position
        : undefined;
    if (companionFeedValue && breakerId && panel && position !== undefined && targetLabel) {
      companionFeed = {
        breakerId,
        feed: companionFeedValue,
        panel,
        position,
        targetLabel,
      };
    }
  }

  return {
    ...(stringValue(record.qdf) ? { qdf: stringValue(record.qdf) } : {}),
    ...(stringValue(record.pairId) ? { pairId: stringValue(record.pairId) } : {}),
    ...(feed ? { feed } : {}),
    ...(stringValue(record.targetLabel) ? { targetLabel: stringValue(record.targetLabel) } : {}),
    ...(stringValue(record.targetEntityName)
      ? { targetEntityName: stringValue(record.targetEntityName) }
      : {}),
    ...(stringValue(record.targetCanonicalEntityName)
      ? { targetCanonicalEntityName: stringValue(record.targetCanonicalEntityName) }
      : {}),
    ...(targetKind ? { targetKind } : {}),
    ...(stringValue(record.targetAid) ? { targetAid: stringValue(record.targetAid) } : {}),
    ...(stringValue(record.targetLocalAid)
      ? { targetLocalAid: stringValue(record.targetLocalAid) }
      : {}),
    ...(stringValue(record.targetRackAid)
      ? { targetRackAid: stringValue(record.targetRackAid) }
      : {}),
    ...(companionFeed ? { companionFeed } : {}),
  };
}

function isActiveBreaker(node: unknown): node is EquipmentNode {
  if (!node || typeof node !== 'object') return false;
  const candidate = node as EquipmentNode;
  return (
    candidate.kind === 'EQUIPMENT' &&
    candidate.lifecycle === 'ACTIVE' &&
    candidate.equipmentType === 'CIRCUIT_BREAKER'
  );
}

export class DeclaredPowerTraceService {
  constructor(private readonly topology: TopologyRepository) {}

  async resolveBreaker(breakerId: string): Promise<DeclaredPowerTrace | null> {
    const selected = await this.topology.getById(breakerId);
    if (!isActiveBreaker(selected)) return null;

    const selectedMetadata = metadata(selected.attributes?.declaredPower);
    if (
      !selectedMetadata?.feed ||
      !selectedMetadata.targetLabel ||
      !selectedMetadata.targetKind ||
      !selectedMetadata.companionFeed
    ) {
      return null;
    }

    const selectedFeed = await this.feedView(selected, selectedMetadata);
    const companionNode = await this.topology.getById(selectedMetadata.companionFeed.breakerId);
    const companionMetadata = isActiveBreaker(companionNode)
      ? metadata(companionNode.attributes?.declaredPower)
      : null;

    const fallbackCompanion: DeclaredPowerTraceFeed = {
      feed: selectedMetadata.companionFeed.feed,
      breakerId: selectedMetadata.companionFeed.breakerId,
      breakerName:
        selectedMetadata.companionFeed.panel +
        '-' +
        String(selectedMetadata.companionFeed.position).padStart(2, '0'),
      panelName: selectedMetadata.companionFeed.panel,
      qdfName: selectedMetadata.qdf ?? selected.deviceId,
      targetLabel: selectedMetadata.companionFeed.targetLabel,
    };

    const companionFeed =
      isActiveBreaker(companionNode) && companionMetadata?.feed
        ? await this.feedView(companionNode, companionMetadata)
        : fallbackCompanion;

    const feedA =
      selectedFeed.feed === 'A'
        ? selectedFeed
        : companionFeed.feed === 'A'
          ? companionFeed
          : undefined;
    const feedB =
      selectedFeed.feed === 'B'
        ? selectedFeed
        : companionFeed.feed === 'B'
          ? companionFeed
          : undefined;

    const targetEntityName =
      selectedMetadata.targetEntityName ??
      selectedMetadata.targetCanonicalEntityName ??
      selectedMetadata.targetLabel;
    const targetCanonicalEntityName =
      selectedMetadata.targetCanonicalEntityName ?? targetEntityName;

    return {
      selectedBreakerId: selected.id,
      ...(selectedMetadata.pairId ? { pairId: selectedMetadata.pairId } : {}),
      targetLabel: selectedMetadata.targetLabel,
      targetEntityName,
      targetCanonicalEntityName,
      targetKind: selectedMetadata.targetKind,
      ...(selectedMetadata.targetRackAid ? { targetRackAid: selectedMetadata.targetRackAid } : {}),
      ...(selectedMetadata.targetAid ? { selectedTargetAid: selectedMetadata.targetAid } : {}),
      ...(selectedMetadata.targetLocalAid
        ? { selectedTargetLocalAid: selectedMetadata.targetLocalAid }
        : {}),
      ...(feedA ? { feedA } : {}),
      ...(feedB ? { feedB } : {}),
    };
  }

  private async feedView(
    breaker: EquipmentNode,
    declaration: DeclaredPowerMetadata,
  ): Promise<DeclaredPowerTraceFeed> {
    const panel = breaker.parentEquipmentId
      ? await this.topology.getById(breaker.parentEquipmentId)
      : null;
    const device = await this.topology.getById(breaker.deviceId);
    const panelName = panel?.kind === 'EQUIPMENT' ? panel.name : 'Panel';
    const qdfName = declaration.qdf ?? (device?.kind === 'DEVICE' ? device.name : breaker.deviceId);

    return {
      feed: declaration.feed ?? (panelName.trim().toUpperCase().startsWith('B') ? 'B' : 'A'),
      breakerId: breaker.id,
      breakerName: breaker.name,
      panelName,
      qdfName,
      targetLabel: declaration.targetLabel ?? breaker.aliases?.[0] ?? breaker.name,
      ...(declaration.targetAid ? { targetAid: declaration.targetAid } : {}),
      ...(declaration.targetLocalAid ? { targetLocalAid: declaration.targetLocalAid } : {}),
    };
  }
}
