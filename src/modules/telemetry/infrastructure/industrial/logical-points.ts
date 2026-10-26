import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { readFile, stat } from 'node:fs/promises';
import type { Signal } from '@/modules/telemetry/domain/industrial/observations';

export interface LogicalPoint {
  logicalPointId: string;
  publicationSignalId: string;
  aliases: string[];
  activeSignalId: string;
  unit: string;
  evidence: string;
}
export interface LogicalRegistry {
  version: number;
  points: LogicalPoint[];
  retiredAlarms?: Record<
    string,
    Pick<Signal, 'id' | 'eventId' | 'sourceIdentity' | 'alarmState' | 'observedAt' | 'receivedAt'>
  >;
}
/** Exactly one active writer. No automatic failover, latest-writer selection or cabling inference. */
export async function logicalRegistry(): Promise<LogicalRegistry | null> {
  const path = process.env.INDUSTRIAL_LOGICAL_POINTS_FILE;
  if (!path) return null;
  if ((await stat(path)).size > 4000000) throw new Error('Oversized logical registry');
  const input = JSON.parse(await readFile(path, 'utf8')) as LogicalRegistry;
  const r: LogicalRegistry = { version: input?.version, points: input?.points };
  if (
    !Number.isInteger(r?.version) ||
    r.version < 1 ||
    !Array.isArray(r.points) ||
    r.points.length > 10000
  )
    throw new Error('Invalid logical registry');
  const logical = new Set<string>(),
    publications = new Set<string>(),
    aliases = new Set<string>();
  for (const p of r.points) {
    if (
      !p ||
      typeof p.logicalPointId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(p.logicalPointId) ||
      logical.has(p.logicalPointId) ||
      !/^[a-f0-9]{64}$/.test(p.publicationSignalId) ||
      publications.has(p.publicationSignalId) ||
      !Array.isArray(p.aliases) ||
      !p.aliases.length ||
      p.aliases.length > 64 ||
      typeof p.activeSignalId !== 'string' ||
      !p.aliases.includes(p.activeSignalId) ||
      typeof p.unit !== 'string' ||
      p.unit.length > 64 ||
      typeof p.evidence !== 'string' ||
      !p.evidence
    )
      throw new Error('Invalid logical point authority');
    logical.add(p.logicalPointId);
    publications.add(p.publicationSignalId);
    for (const alias of p.aliases) {
      if (typeof alias !== 'string' || !/^[a-f0-9]{64}$/.test(alias) || aliases.has(alias))
        throw new Error('Ambiguous logical point alias');
      aliases.add(alias);
    }
  }
  // A published identity cannot silently become another point's transport alias.
  for (const p of r.points)
    if (r.points.some((q) => q !== p && q.aliases.includes(p.publicationSignalId)))
      throw new Error('Publication identity collision');
  if (getPersistenceMode() !== 'memory') {
    const collection = (await getMongoDatabase()).collection('industrial_logical_registry');
    const key = { name: 'approved' };
    await collection.createIndex({ name: 1 }, { unique: true });
    const previous = await collection.findOne(key);
    const encoded = JSON.stringify(r);
    let retiredAlarms = JSON.parse(
      (previous?.alarmEvidenceJson as string | undefined) ?? '{}',
    ) as NonNullable<LogicalRegistry['retiredAlarms']>;
    if (previous) {
      const old = JSON.parse(previous.registryJson as string) as LogicalRegistry;
      if (
        r.version < old.version ||
        (r.version === old.version && encoded !== previous.registryJson)
      )
        throw new Error('Logical registry version regression or unversioned change');
      for (const point of old.points) {
        const next = r.points.find((p) => p.logicalPointId === point.logicalPointId);
        if (
          !next ||
          next.publicationSignalId !== point.publicationSignalId ||
          next.unit !== point.unit ||
          point.aliases.some((alias) => !next.aliases.includes(alias))
        )
          throw new Error('Logical point identity and historical aliases are immutable');
      }
      if (r.version > old.version) {
        // Freeze the retired writer's last explicit alarm state at controlled cutover.
        // This evidence survives bridge/app restart without letting later inactive packets win.
        retiredAlarms = { ...retiredAlarms };
        for (const oldPoint of old.points) {
          const next = r.points.find((p) => p.logicalPointId === oldPoint.logicalPointId)!;
          if (next.activeSignalId === oldPoint.activeSignalId) continue;
          const doc = await (
            await getMongoDatabase()
          )
            .collection('industrial_signals')
            .findOne({ signalId: oldPoint.activeSignalId });
          const alarm = doc?.signal as Signal | undefined;
          if (alarm?.kind === 'alarm' && ['ACTIVE', 'RESOLVED'].includes(alarm.alarmState ?? '')) {
            retiredAlarms[oldPoint.publicationSignalId] = {
              id: alarm.id,
              eventId: alarm.eventId,
              sourceIdentity: alarm.sourceIdentity,
              alarmState: alarm.alarmState,
              observedAt:
                'alarmObservedAt' in alarm ? String(alarm.alarmObservedAt) : alarm.observedAt,
              receivedAt: alarm.receivedAt,
            };
          }
        }
        const result = await collection.updateOne(
          { ...key, registryJson: previous.registryJson },
          { $set: { registryJson: encoded, alarmEvidenceJson: JSON.stringify(retiredAlarms) } },
        );
        if (!result.matchedCount) throw new Error('Concurrent logical registry update; retry');
      }
    } else {
      await collection.insertOne({ ...key, registryJson: encoded, alarmEvidenceJson: '{}' });
    }
    r.retiredAlarms = retiredAlarms;
  }
  return r;
}
export function associateLogicalSignals(
  signals: Signal[],
  registry: LogicalRegistry | null,
): Signal[] {
  return signals.map((signal) => {
    const p = registry?.points.find((p) => p.aliases.includes(signal.id));
    if (!p) return signal;
    if (signal.kind === 'measurement' && signal.unit !== p.unit)
      throw new Error('Logical point engineering unit mismatch');
    return {
      ...signal,
      logicalPointId: p.logicalPointId,
      publicationSignalId: p.publicationSignalId,
      authoritative: p.activeSignalId === signal.id,
    };
  });
}
