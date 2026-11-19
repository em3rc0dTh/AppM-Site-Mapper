import type { PowerFeed } from '@/modules/power/domain/entities';

export type PoweredTargetKind = 'EQUIPMENT' | 'PDU';

export interface DeclaredPowerTargetContext {
  readonly targetFootprint?: string;
  readonly rackAid?: string;
}

export interface PoweredEquipmentEndpoint {
  readonly equipmentKey: string;
  readonly equipmentName: string;
  readonly targetKind: PoweredTargetKind;
  readonly aid: string;
  readonly localAid: string;
  readonly baseAid?: string;
  readonly rackAid?: string;
  readonly targetLabel: string;
  readonly displayLabel: string;
  readonly shelf?: string;
  readonly module?: string;
  readonly endpoint?: string;
  readonly side?: PowerFeed;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizePoweredEquipmentKey(value: string): string {
  return normalizeWhitespace(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizedShelf(token: string): string | undefined {
  const match = /^SH0*(\d+)$/i.exec(token);
  return match ? `SH${Number(match[1])}` : undefined;
}

function endpointSide(value: string | undefined): PowerFeed | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  if (/^(?:FEED-)?A(?:\d|\b|[._-])/.test(normalized) || /^PA\d/.test(normalized)) return 'A';
  if (/^(?:FEED-)?B(?:\d|\b|[._-])/.test(normalized) || /^PB\d/.test(normalized)) return 'B';
  return undefined;
}

function isModuleToken(token: string): boolean {
  return /^(?:PSU\d+|PEM\d*|PS\d+|L\d+)$/i.test(token);
}

function rackAidFromContext(context: DeclaredPowerTargetContext | undefined): string | undefined {
  const explicit = context?.rackAid?.trim();
  if (explicit) return explicit;
  const footprint = context?.targetFootprint?.trim();
  return footprint ? `RACK::${footprint}` : undefined;
}

function parsePduTarget(
  targetLabel: string,
  context: DeclaredPowerTargetContext | undefined,
): PoweredEquipmentEndpoint | null {
  const match = /\bPDU\s*[- ]?0*(\d+)\s*[- ]?([AB])\b/i.exec(targetLabel);
  if (!match) return null;

  const rackAid = rackAidFromContext(context);
  if (!rackAid) return null;

  const pduNumber = String(Number(match[1])).padStart(2, '0');
  const side = match[2]!.toUpperCase() as PowerFeed;
  const pduToken = `PDU${pduNumber}`;
  const equipmentName = `PDU ${pduNumber}`;
  const baseAid = `${rackAid}::${pduToken}`;
  const aid = `${baseAid}::${side}`;
  const localAid = `${pduToken}::NoShelf::NoSlot::${side}`;

  return {
    equipmentKey: normalizePoweredEquipmentKey(baseAid),
    equipmentName,
    targetKind: 'PDU',
    aid,
    localAid,
    baseAid,
    rackAid,
    targetLabel,
    displayLabel: `Feed ${side}`,
    endpoint: side,
    side,
  };
}

/**
 * Parses declared electrical targets without mutating topology.
 *
 * The returned AID is documentary endpoint identity, not a canonical topology ID.
 * PDU identity is rack-scoped because workbook "Hoja1" confirms that local names such
 * as "PDU 01" may repeat in different racks.
 */
export function parseDeclaredPowerTarget(
  value: string,
  context?: DeclaredPowerTargetContext,
): PoweredEquipmentEndpoint | null {
  const targetLabel = normalizeWhitespace(value);
  if (!targetLabel) return null;

  if (/\bPDU[\s\w.-]*/i.test(targetLabel)) {
    return parsePduTarget(targetLabel, context);
  }

  const rackAid = rackAidFromContext(context);
  const tokens = targetLabel.split(' ');
  const equipmentName = tokens.shift();
  if (!equipmentName) return null;

  let shelf: string | undefined;
  let moduleName: string | undefined;
  let endpoint: string | undefined;

  if (tokens[0]) {
    const parsedShelf = normalizedShelf(tokens[0]);
    if (parsedShelf) {
      shelf = parsedShelf;
      tokens.shift();
    }
  }

  if (tokens[0]?.toUpperCase() === 'FEED') {
    tokens.shift();
    if (tokens.length) endpoint = `FEED-${tokens.join('-')}`;
  } else if (tokens[0] && isModuleToken(tokens[0])) {
    moduleName = tokens.shift();
    if (tokens.length) endpoint = tokens.join('-');
  } else if (tokens.length) {
    endpoint = tokens.join('-');
  }

  const equipmentKey = normalizePoweredEquipmentKey(equipmentName);
  if (!equipmentKey) return null;

  const side = endpointSide(endpoint);
  const aid = [
    equipmentName,
    shelf ?? 'NoShelf',
    moduleName ?? 'NoSlot',
    endpoint ?? 'NoPort',
  ].join('::');
  const localAid = aid;
  const displayLabel =
    [shelf, moduleName, endpoint].filter((part): part is string => Boolean(part)).join(' / ') ||
    equipmentName;

  return {
    equipmentKey,
    equipmentName,
    targetKind: 'EQUIPMENT',
    aid,
    localAid,
    ...(rackAid ? { rackAid } : {}),
    targetLabel,
    displayLabel,
    ...(shelf ? { shelf } : {}),
    ...(moduleName ? { module: moduleName } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(side ? { side } : {}),
  };
}
