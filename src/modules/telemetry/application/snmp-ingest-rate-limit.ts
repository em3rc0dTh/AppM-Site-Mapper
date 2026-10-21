import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';

const MINUTE_MS = 60_000;
const DEFAULT_MAX_RPM = 120;

export function snmpIngressQuotaLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_MAX_RPM;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 10_000) {
    throw new Error('Invalid SNMP_INGEST_MAX_RPM');
  }
  return value;
}

export function snmpIngressQuotaKey(sourceIdentity: string, nowMs: number): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(sourceIdentity)) {
    throw new Error('Invalid SNMP source identity');
  }
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error('Invalid SNMP quota clock');
  return sourceIdentity + ':' + Math.floor(nowMs / MINUTE_MS);
}

/** One durable, atomic request counter shared by all Next.js replicas.
 * Applied AFTER source-scoped Bearer authorization; edge/WAF quotas remain required.
 */
export async function reserveSnmpIngressQuota(
  sourceIdentity: string,
  nowMs = Date.now(),
  limit = snmpIngressQuotaLimit(process.env.SNMP_INGEST_MAX_RPM),
): Promise<boolean> {
  const key = snmpIngressQuotaKey(sourceIdentity, nowMs);
  const expiresAt = new Date((Math.floor(nowMs / MINUTE_MS) + 2) * MINUTE_MS);
  const collection = (await getMongoDatabase()).collection<{
    key: string;
    requests: number;
    expiresAt: Date;
  }>('snmp_ingest_quota');
  let record;
  try {
    record = await collection.findOneAndUpdate(
      { key },
      { $inc: { requests: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: 'after' },
    );
  } catch (error) {
    // Competing first writes can race on the unique bucket key. Charge exactly
    // once by retrying as an update, never by creating another bucket.
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) {
      throw error;
    }
    record = await collection.findOneAndUpdate(
      { key },
      { $inc: { requests: 1 } },
      { returnDocument: 'after' },
    );
  }
  if (!record || typeof record.requests !== 'number') {
    throw new Error('SNMP_INGEST_QUOTA_UNAVAILABLE');
  }
  return record.requests <= limit;
}
