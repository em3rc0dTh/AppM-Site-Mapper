import type { PowerRepository } from '@/modules/power/application/power-repository';
import type { PowerTargetCatalogRepository } from '@/modules/power/application/power-target-catalog-repository';
import type { PowerFeed } from '@/modules/power/domain/entities';
import {
  buildPowerTargetCatalogIdentity,
  powerTargetIdentityKey,
  type CreatePowerTargetCatalogInput,
  type PowerTargetCatalogEntry,
  type PowerTargetCatalogKind,
} from '@/modules/power/domain/power-target-catalog';
import { parseDeclaredPowerTarget } from '@/modules/power/domain/powered-equipment';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { EquipmentNode, TopologyNode } from '@/modules/topology/domain/entities';
import { createDomainId, nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type PowerTargetCatalogError =
  | 'TARGET_NOT_FOUND'
  | 'SOURCE_PORT_NOT_FOUND'
  | 'SOURCE_NOT_BREAKER'
  | 'INVALID_SOURCE_PORT'
  | 'SOURCE_ALREADY_CONNECTED'
  | 'FEED_MISMATCH'
  | 'TOPOLOGY_CONFLICT';

export interface AssignDeclaredPowerTargetInput {
  readonly sourceAccessPortId: string;
  readonly targetIdentityKey: string;
  readonly feed: PowerFeed;
  readonly note?: string;
}

type DeclaredPowerMetadata = {
  readonly sourceDocument?: string;
  readonly feed?: PowerFeed;
  readonly targetLabel?: string;
  readonly targetEntityName?: string;
  readonly targetCanonicalEntityName?: string;
  readonly targetKind?: PowerTargetCatalogKind;
  readonly targetAid?: string;
  readonly targetLocalAid?: string;
  readonly targetRackAid?: string;
  readonly targetFootprint?: string;
};

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function declaredMetadata(value: unknown): DeclaredPowerMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const sourceDocument = textValue(record.sourceDocument);
  const feed = record.feed === 'A' || record.feed === 'B' ? record.feed : undefined;
  const targetLabel = textValue(record.targetLabel);
  const targetEntityName = textValue(record.targetEntityName);
  const targetCanonicalEntityName = textValue(record.targetCanonicalEntityName);
  const targetKind =
    record.targetKind === 'EQUIPMENT' || record.targetKind === 'PDU'
      ? record.targetKind
      : undefined;
  const targetAid = textValue(record.targetAid);
  const targetLocalAid = textValue(record.targetLocalAid);
  const targetRackAid = textValue(record.targetRackAid);
  const targetFootprint = textValue(record.targetFootprint);
  return {
    ...(sourceDocument ? { sourceDocument } : {}),
    ...(feed ? { feed } : {}),
    ...(targetLabel ? { targetLabel } : {}),
    ...(targetEntityName ? { targetEntityName } : {}),
    ...(targetCanonicalEntityName ? { targetCanonicalEntityName } : {}),
    ...(targetKind ? { targetKind } : {}),
    ...(targetAid ? { targetAid } : {}),
    ...(targetLocalAid ? { targetLocalAid } : {}),
    ...(targetRackAid ? { targetRackAid } : {}),
    ...(targetFootprint ? { targetFootprint } : {}),
  };
}

function activeBreaker(node: TopologyNode): node is EquipmentNode {
  return (
    node.kind === 'EQUIPMENT' &&
    node.lifecycle === 'ACTIVE' &&
    node.equipmentType === 'CIRCUIT_BREAKER'
  );
}

function panelFeed(name: string | undefined): PowerFeed | undefined {
  const normalized = name?.trim().toUpperCase() ?? '';
  if (/^A(?:\d|\b|[-_ ])/.test(normalized)) return 'A';
  if (/^B(?:\d|\b|[-_ ])/.test(normalized)) return 'B';
  return undefined;
}

function footprintFromRackAid(rackAid: string): string {
  return rackAid.replace(/^RACK::/i, '');
}

export class PowerTargetCatalogService {
  constructor(
    private readonly topology: TopologyRepository,
    private readonly power: PowerRepository,
    private readonly repository: PowerTargetCatalogRepository,
  ) {}

  async list(): Promise<readonly PowerTargetCatalogEntry[]> {
    const [manualTargets, equipmentNodes] = await Promise.all([
      this.repository.listActive(),
      this.topology.listByKind('EQUIPMENT'),
    ]);
    const targets = new Map<string, PowerTargetCatalogEntry>();

    for (const node of equipmentNodes) {
      if (!activeBreaker(node)) continue;
      const metadata = declaredMetadata(node.attributes?.declaredPower);
      if (!metadata?.targetLabel) continue;

      const parsed = parseDeclaredPowerTarget(metadata.targetLabel, {
        ...(metadata.targetFootprint ? { targetFootprint: metadata.targetFootprint } : {}),
        ...(metadata.targetRackAid ? { rackAid: metadata.targetRackAid } : {}),
        ...(metadata.feed ? { feed: metadata.feed } : {}),
      });
      if (!parsed) continue;

      const rackAid = metadata.targetRackAid ?? parsed.rackAid;
      const localAid = metadata.targetLocalAid ?? parsed.localAid;
      if (!rackAid || !localAid) continue;

      const identityKey = powerTargetIdentityKey(rackAid, localAid);
      if (targets.has(identityKey)) continue;

      const sourceReference = metadata.sourceDocument;
      const inferredFeed = metadata.feed ?? parsed.side;
      targets.set(identityKey, {
        id: `declared:${identityKey}`,
        lifecycle: 'ACTIVE',
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        identityKey,
        equipmentKey: parsed.equipmentKey,
        equipmentName: metadata.targetEntityName ?? parsed.equipmentName,
        canonicalEquipmentName: metadata.targetCanonicalEntityName ?? parsed.canonicalEquipmentName,
        targetKind: metadata.targetKind ?? parsed.targetKind,
        footprint: metadata.targetFootprint ?? footprintFromRackAid(rackAid),
        rackAid,
        localAid,
        aid: metadata.targetAid ?? parsed.aid,
        displayLabel: metadata.targetLabel,
        ...(parsed.shelf ? { shelf: parsed.shelf } : {}),
        ...(parsed.module ? { module: parsed.module } : {}),
        ...(parsed.endpoint ? { endpoint: parsed.endpoint } : {}),
        ...(inferredFeed ? { feed: inferredFeed } : {}),
        origin: sourceReference?.toUpperCase().includes('SITEMAPPER_POWER_TARGET_CATALOG')
          ? 'SITEMAPPER'
          : 'EXCEL',
        ...(sourceReference ? { sourceReference } : {}),
      });
    }

    for (const target of manualTargets) targets.set(target.identityKey, target);

    return [...targets.values()].sort(
      (left, right) =>
        left.displayLabel.localeCompare(right.displayLabel) ||
        left.rackAid.localeCompare(right.rackAid) ||
        left.localAid.localeCompare(right.localAid),
    );
  }

  async create(
    input: CreatePowerTargetCatalogInput,
  ): Promise<Result<PowerTargetCatalogEntry, never>> {
    const identity = buildPowerTargetCatalogIdentity(input);
    const existing = (await this.list()).find(
      (target) => target.identityKey === identity.identityKey,
    );
    if (existing) return success(existing);

    const timestamp = nowIso();
    const target: PowerTargetCatalogEntry = {
      ...identity,
      id: createDomainId(),
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      origin: 'SITEMAPPER',
      sourceReference: 'SITEMAPPER_POWER_TARGET_CATALOG',
    };

    try {
      await this.repository.insert(target);
      return success(target);
    } catch (error) {
      const duplicate = error as { code?: number };
      if (duplicate.code === 11000) {
        const current = await this.repository.getByIdentityKey(target.identityKey);
        if (current) return success(current);
      }
      throw error;
    }
  }

  async assign(
    input: AssignDeclaredPowerTargetInput,
  ): Promise<
    Result<
      { breakerId: string; target: PowerTargetCatalogEntry; feed: PowerFeed },
      PowerTargetCatalogError
    >
  > {
    const sourceOwner = await this.topology.getEquipmentByAccessPortId(input.sourceAccessPortId);
    if (!sourceOwner) return failure('SOURCE_PORT_NOT_FOUND');
    if (!activeBreaker(sourceOwner)) return failure('SOURCE_NOT_BREAKER');

    const sourcePort = sourceOwner.accessPorts.find(
      (port) => port.id === input.sourceAccessPortId && port.lifecycle === 'ACTIVE',
    );
    if (
      !sourcePort ||
      sourcePort.portType !== 'POWER' ||
      sourcePort.exposure !== 'EXTERNAL' ||
      sourcePort.direction === 'INPUT'
    ) {
      return failure('INVALID_SOURCE_PORT');
    }

    if ((await this.power.listForAccessPort(sourcePort.id)).length) {
      return failure('SOURCE_ALREADY_CONNECTED');
    }

    const target = (await this.list()).find(
      (candidate) => candidate.identityKey === input.targetIdentityKey,
    );
    if (!target) return failure('TARGET_NOT_FOUND');

    const panel = sourceOwner.parentEquipmentId
      ? await this.topology.getById(sourceOwner.parentEquipmentId)
      : null;
    const sourceFixedFeed =
      sourcePort.attributes?.feed === 'A' || sourcePort.attributes?.feed === 'B'
        ? sourcePort.attributes.feed
        : panel?.kind === 'EQUIPMENT'
          ? panelFeed(panel.name)
          : undefined;

    if (
      (sourceFixedFeed && sourceFixedFeed !== input.feed) ||
      (target.feed && target.feed !== input.feed)
    ) {
      return failure('FEED_MISMATCH');
    }

    const device = await this.topology.getById(sourceOwner.deviceId);
    const qdf = device?.kind === 'DEVICE' ? device.name : sourceOwner.deviceId;
    const previous =
      sourceOwner.attributes?.declaredPower &&
      typeof sourceOwner.attributes.declaredPower === 'object' &&
      !Array.isArray(sourceOwner.attributes.declaredPower)
        ? (sourceOwner.attributes.declaredPower as Record<string, unknown>)
        : {};
    const previousRemarks = Array.isArray(previous.remarks)
      ? previous.remarks.filter(
          (value): value is string => typeof value === 'string' && Boolean(value.trim()),
        )
      : [];
    const note = input.note?.trim();
    const updated: EquipmentNode = {
      ...sourceOwner,
      attributes: {
        ...(sourceOwner.attributes ?? {}),
        declaredPower: {
          ...previous,
          contractVersion: Math.max(
            typeof previous.contractVersion === 'number' ? previous.contractVersion : 0,
            4,
          ),
          state: 'DECLARED',
          sourceDocument: target.sourceReference ?? 'SITEMAPPER_POWER_TARGET_CATALOG',
          identitySourceDocument: target.sourceReference ?? 'SITEMAPPER_POWER_TARGET_CATALOG',
          associationSource: 'OPERATOR',
          qdf,
          feed: input.feed,
          targetLabel: target.displayLabel,
          targetEntityName: target.equipmentName,
          targetCanonicalEntityName: target.canonicalEquipmentName,
          targetKind: target.targetKind,
          targetAid: target.aid,
          targetLocalAid: target.localAid,
          targetRackAid: target.rackAid,
          targetFootprint: target.footprint,
          targetCatalogKey: target.identityKey,
          targetPlacement: 'RACK_ASSOCIATED_U_UNKNOWN',
          targetMaterialization: 'NOT_CREATED',
          remarks: note ? [note] : previousRemarks,
          targetAliases: [
            ...new Set([
              ...(Array.isArray(previous.targetAliases)
                ? previous.targetAliases.filter(
                    (value): value is string => typeof value === 'string',
                  )
                : []),
              target.displayLabel,
            ]),
          ],
        },
      },
      updatedAt: nowIso(),
    };

    const committed = this.topology.commitLayout
      ? await this.topology.commitLayout([sourceOwner], [updated])
      : (await this.topology.replace(updated), true);
    if (!committed) return failure('TOPOLOGY_CONFLICT');

    return success({ breakerId: sourceOwner.id, target, feed: input.feed });
  }
}
