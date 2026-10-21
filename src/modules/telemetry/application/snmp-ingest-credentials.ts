import { createHash, timingSafeEqual } from 'node:crypto';

export function collectorTokenEquals(header: string | null, secret: string): boolean {
  if (!header?.startsWith('Bearer ') || secret.length < 32) return false;
  const a = createHash('sha256').update(header.slice(7)).digest();
  const z = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, z);
}

export function sourceCredentialMap(json: string | undefined): Map<string,string> {
  if (!json) throw new Error('SNMP_SOURCE_TOKENS_REQUIRED');
  const data: unknown = JSON.parse(json);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('INVALID_SNMP_SOURCE_TOKENS');
  const items = Object.entries(data);
  if (!items.length || items.length > 64) throw new Error('INVALID_SNMP_SOURCE_TOKENS');
  const tokens = new Set<string>();
  for (const [source, token] of items) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(source) ||
      ['__proto__','constructor','prototype'].includes(source) ||
      typeof token !== 'string' || token.length < 32 || token.length > 2048 || tokens.has(token))
      throw new Error('INVALID_SNMP_SOURCE_TOKENS');
    tokens.add(token);
  }
  return new Map(items as [string,string][]);
}

export function authorizeController(header: string | null, json: string | undefined): string | null {
  const sources = sourceCredentialMap(json);
  let matched: string | null = null;
  for (const [identity, secret] of sources)
    if (collectorTokenEquals(header, secret)) matched = identity;
  return matched;
}
