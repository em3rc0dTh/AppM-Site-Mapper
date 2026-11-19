import type { PowerFeed } from '@/modules/power/domain/entities';

export interface PoweredEquipmentEndpoint {
  readonly equipmentKey: string;
  readonly equipmentName: string;
  readonly aid: string;
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

/**
 * Parses declared electrical targets without mutating topology.
 *
 * PDU labels are deliberately excluded until their field semantics are confirmed.
 * The returned AID is a projection key for the electrical endpoint, not a Device/Equipment ID.
 */
export function parseDeclaredPowerTarget(value: string): PoweredEquipmentEndpoint | null {
  const targetLabel = normalizeWhitespace(value);
  if (!targetLabel || /\bPDU[\w.-]*/i.test(targetLabel)) return null;

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
  const displayLabel =
    [shelf, moduleName, endpoint].filter((part): part is string => Boolean(part)).join(' / ') ||
    equipmentName;

  return {
    equipmentKey,
    equipmentName,
    aid,
    targetLabel,
    displayLabel,
    ...(shelf ? { shelf } : {}),
    ...(moduleName ? { module: moduleName } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(side ? { side } : {}),
  };
}
