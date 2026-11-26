import type { DomainEntity } from '@/shared/domain/entity';
import type { PowerFeed } from '@/modules/power/domain/entities';
import { normalizePoweredEquipmentKey } from '@/modules/power/domain/powered-equipment';

export type PowerTargetCatalogOrigin = 'EXCEL' | 'SITEMAPPER';
export type PowerTargetCatalogKind = 'EQUIPMENT' | 'PDU';

export interface PowerTargetCatalogEntry extends DomainEntity {
  readonly identityKey: string;
  readonly equipmentKey: string;
  readonly equipmentName: string;
  readonly canonicalEquipmentName: string;
  readonly targetKind: PowerTargetCatalogKind;
  readonly footprint: string;
  readonly rackAid: string;
  readonly localAid: string;
  readonly aid: string;
  readonly displayLabel: string;
  readonly shelf?: string;
  readonly module?: string;
  readonly endpoint?: string;
  readonly feed?: PowerFeed;
  readonly origin: PowerTargetCatalogOrigin;
  readonly sourceReference?: string;
}

export interface CreatePowerTargetCatalogInput {
  readonly equipmentName: string;
  readonly footprint: string;
  readonly shelf?: string;
  readonly module?: string;
  readonly endpoint?: string;
  readonly displayLabel?: string;
  readonly feed?: PowerFeed;
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized ? normalized : undefined;
}

function aidToken(value: string): string {
  return value.trim().replace(/\s+/g, '-');
}

export function powerTargetIdentityKey(rackAid: string, localAid: string): string {
  return `${rackAid.trim().toUpperCase()}|${localAid.trim().toUpperCase()}`;
}

export function buildPowerTargetCatalogIdentity(input: CreatePowerTargetCatalogInput): Omit<
  PowerTargetCatalogEntry,
  'id' | 'lifecycle' | 'createdAt' | 'updatedAt' | 'origin' | 'sourceReference'
> {
  const equipmentName = clean(input.equipmentName);
  const footprint = clean(input.footprint);
  if (!equipmentName) throw new Error('EQUIPMENT_NAME_REQUIRED');
  if (!footprint) throw new Error('FOOTPRINT_REQUIRED');

  const equipmentKey = normalizePoweredEquipmentKey(equipmentName);
  if (!equipmentKey) throw new Error('EQUIPMENT_KEY_INVALID');

  const shelf = clean(input.shelf);
  const moduleName = clean(input.module);
  const endpoint = clean(input.endpoint);
  const rackAid = `RACK::${footprint}`;
  const localAid = [
    aidToken(equipmentName),
    shelf ?? 'NoShelf',
    moduleName ?? 'NoSlot',
    endpoint ?? 'NoPort',
  ].join('::');
  const displayLabel =
    clean(input.displayLabel) ??
    [equipmentName, shelf, moduleName, endpoint]
      .filter((value): value is string => Boolean(value))
      .join(' ');

  return {
    identityKey: powerTargetIdentityKey(rackAid, localAid),
    equipmentKey,
    equipmentName,
    canonicalEquipmentName: equipmentName,
    targetKind: 'EQUIPMENT',
    footprint,
    rackAid,
    localAid,
    aid: localAid,
    displayLabel,
    ...(shelf ? { shelf } : {}),
    ...(moduleName ? { module: moduleName } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(input.feed ? { feed: input.feed } : {}),
  };
}
