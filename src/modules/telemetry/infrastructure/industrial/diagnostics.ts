import { industrialHistoryDiagnostics } from './timescale-outbox';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseProfiles } from '@/modules/telemetry/domain/industrial/observations';
function runtimeFaults() {
  return getProcessSingleton<Set<string>>('industrial-runtime-faults', () => new Set());
}
export function recordIndustrialFault(
  code: 'INDUSTRIAL_PROFILES_INVALID' | 'MQTT_CAPTURE_UNAVAILABLE',
) {
  runtimeFaults().add(code);
}
interface Snapshot {
  version: number;
  protocol: string;
  updatedAt: string;
  pending: number;
  capacity: number;
  counters: Record<string, number>;
  alerts: string[];
}
async function snapshot(path: string | undefined, protocol: string) {
  if (!path)
    return {
      protocol,
      status: 'NOT_CONFIGURED',
      alerts: [`${protocol}_DIAGNOSTICS_NOT_CONFIGURED`],
    };
  try {
    if ((await stat(path)).size > 65536) throw new Error('Oversized snapshot');
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!value || typeof value !== 'object') throw new Error('Invalid snapshot');
    const s = value as Snapshot;
    if (
      s.version !== 1 ||
      s.protocol !== protocol ||
      !Number.isFinite(Date.parse(s.updatedAt)) ||
      Date.parse(s.updatedAt) > Date.now() + 60000 ||
      !Number.isInteger(s.pending) ||
      s.pending < 0 ||
      !Number.isInteger(s.capacity) ||
      s.capacity < 1 ||
      s.capacity > 10000 ||
      !s.counters ||
      typeof s.counters !== 'object' ||
      Array.isArray(s.counters) ||
      Object.keys(s.counters).length > 64 ||
      Object.values(s.counters).some((n) => !Number.isSafeInteger(n) || n < 0) ||
      !Array.isArray(s.alerts) ||
      s.alerts.length > 16 ||
      s.alerts.some((a) => typeof a !== 'string' || !/^[A-Z_]{1,80}$/.test(a))
    )
      throw new Error('Invalid snapshot');
    const stale = Date.now() - Date.parse(s.updatedAt) > 120000;
    return {
      protocol,
      status: stale ? 'STALE' : s.alerts.length ? 'DEGRADED' : 'OK',
      updatedAt: s.updatedAt,
      pending: s.pending,
      capacity: s.capacity,
      counters: s.counters,
      alerts: [...s.alerts, ...(stale ? [`${protocol}_DIAGNOSTICS_STALE`] : [])],
    };
  } catch {
    return { protocol, status: 'UNAVAILABLE', alerts: [`${protocol}_DIAGNOSTICS_UNAVAILABLE`] };
  }
}
/** Read counters only; never return spool paths, source credentials or capture payloads. */
export async function captureDiagnostics() {
  let profiles;
  try {
    profiles = parseProfiles(process.env.INDUSTRIAL_PROFILES_JSON);
  } catch {
    return { status: 'DEGRADED', alerts: ['INDUSTRIAL_PROFILES_INVALID'], sources: [] };
  }
  const jobs = [];
  if (profiles.some((p) => p.protocol === 'MQTT'))
    jobs.push(
      snapshot(
        join(
          process.env.INDUSTRIAL_MQTT_SPOOL ?? join(process.cwd(), '.runtime', 'industrial-mqtt'),
          'diagnostics.json',
        ),
        'MQTT',
      ),
    );
  if (profiles.some((p) => p.protocol === 'SNMP'))
    jobs.push(snapshot(process.env.INDUSTRIAL_SNMP_DIAGNOSTICS_FILE, 'SNMP'));
  const sources = await Promise.all(jobs);
  const history = await industrialHistoryDiagnostics();
  const alerts = [
    ...new Set([...sources.flatMap((s) => s.alerts), ...history.alerts, ...runtimeFaults()]),
  ];
  return {
    status: alerts.length ? 'DEGRADED' : sources.length ? 'OK' : 'DISABLED',
    alerts,
    sources,
    history,
  };
}
