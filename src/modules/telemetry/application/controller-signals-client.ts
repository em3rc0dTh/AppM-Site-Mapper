import type { SnmpControllerObservation } from './snmp-controller-presentation';

export interface ControllerCatalogSignal extends SnmpControllerObservation {
  readonly id: string;
  readonly eventId?: string;
  readonly sourceIdentity: string;
  readonly protocol: 'SNMP';
  readonly mibName?: string | null;
  readonly mibFile?: string | null;
  readonly mibKind?: string | null;
  readonly mibSyntax?: string | null;
  readonly mibObjects?: readonly string[] | null;
  readonly communicationQuality?: string;
  readonly kind?: string;
}

/** Follow the existing catalog cursor; publish no partial page set on errors. */
export async function fetchControllerSignals(
  source: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<ControllerCatalogSignal[]> {
  const result: ControllerCatalogSignal[] = [];
  const cursors = new Set<string>();
  const keys = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ source, limit: '500' });
    if (cursor) params.set('cursor', cursor);
    const response = await request('/api/telemetry/industrial/signals?' + params, {
      cache: 'no-store',
      signal: signal ?? null,
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const body = await response.json();
    if (!body || !Array.isArray(body.signals)) throw new Error('INVALID_SIGNAL_RESPONSE');
    for (const item of body.signals) {
      if (!item || typeof item.key !== 'string' || item.sourceIdentity !== source)
        throw new Error('INVALID_SIGNAL_SOURCE');
      if (item.protocol !== 'SNMP') continue;
      if (keys.has(item.key)) throw new Error('DUPLICATE_SIGNAL');
      keys.add(item.key);
      result.push(item as ControllerCatalogSignal);
    }
    if (body.truncated === false && !body.nextCursor) return result;
    if (
      typeof body.nextCursor !== 'string' ||
      !/^[a-f0-9]{64}$/.test(body.nextCursor) ||
      cursors.has(body.nextCursor)
    )
      throw new Error('INVALID_SIGNAL_CURSOR');
    cursor = body.nextCursor;
    cursors.add(body.nextCursor);
  }
  throw new Error('SIGNAL_PAGE_LIMIT');
}
