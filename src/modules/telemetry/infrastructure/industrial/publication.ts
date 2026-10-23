import { readFile, stat } from 'node:fs/promises';
import type { Signal } from '@/modules/telemetry/domain/industrial/observations';
export interface PublishedPoint {
  signalId: string;
  logicalPointId?: string;
  unitId: number;
  address: number;
  unit: string;
  description: string;
}
export interface PublicationManifest {
  version: number;
  points: PublishedPoint[];
}
/** Same read-only approved file is mounted into Site Mapper and the bridge. */
export async function publicationManifest(): Promise<PublicationManifest | null> {
  const path = process.env.INDUSTRIAL_MODBUS_POINTS_FILE;
  if (!path) return null;
  if ((await stat(path)).size > 4000000) throw new Error('Oversized publication manifest');
  const input: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (
    !input ||
    typeof input !== 'object' ||
    !('version' in input) ||
    !Number.isInteger(input.version) ||
    Number(input.version) < 1 ||
    !('points' in input) ||
    !Array.isArray(input.points) ||
    input.points.length > 10000
  )
    throw new Error('Invalid publication manifest');
  const ids = new Set<string>(),
    slots = new Set<string>();
  for (const p of input.points) {
    if (
      !p ||
      typeof p !== 'object' ||
      typeof p.signalId !== 'string' ||
      !/^[a-f0-9]{64}$/.test(p.signalId) ||
      ids.has(p.signalId) ||
      !Number.isInteger(p.unitId) ||
      p.unitId < 1 ||
      p.unitId > 247 ||
      !Number.isInteger(p.address) ||
      p.address < 1024 ||
      p.address > 65533 ||
      typeof p.unit !== 'string' ||
      typeof p.description !== 'string' ||
      (p.logicalPointId !== undefined &&
        (typeof p.logicalPointId !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(p.logicalPointId)))
    )
      throw new Error('Invalid publication point');
    ids.add(p.signalId);
    for (let a = p.address; a < p.address + 3; a++) {
      const key = `${p.unitId}:${a}`;
      if (slots.has(key)) throw new Error('Overlapping publication points');
      slots.add(key);
    }
  }
  return input as PublicationManifest;
}
export function publicationStatus(signal: Signal, manifest: PublicationManifest | null) {
  const point = manifest?.points.find(
    (p) =>
      p.signalId === (signal.publicationSignalId ?? signal.id) ||
      (p.logicalPointId !== undefined && p.logicalPointId === signal.logicalPointId),
  );
  const interpreted = signal.kind !== 'unknown' && signal.interpretation !== 'UNINTERPRETED';
  const knownAlarm =
    signal.kind === 'alarm' && ['ACTIVE', 'RESOLVED'].includes(signal.alarmState ?? '');
  const numeric =
    typeof signal.value === 'boolean' ||
    (typeof signal.value === 'number' &&
      Number.isFinite(signal.value) &&
      Number.isFinite(Math.fround(signal.value)));
  const compatible =
    interpreted &&
    (knownAlarm || numeric) &&
    (!point || signal.kind !== 'measurement' || signal.unit === point.unit);
  return {
    interpreted,
    associated: Boolean(signal.targetId),
    availableInEquipmentInspector: Boolean(signal.targetId),
    modbusCompatible: compatible,
    addressAssigned: Boolean(point),
    registryVersion: manifest?.version ?? null,
    point: point
      ? {
          unitId: point.unitId,
          address: point.address,
          qualityAddress: point.address + 2,
          functionCode: 3,
          dataType: 'FLOAT32',
          wordOrder: 'ABCD',
        }
      : null,
    stage: !interpreted
      ? 'UNINTERPRETED'
      : !compatible
        ? 'NOT_REPRESENTABLE'
        : !point
          ? 'UNASSIGNED'
          : 'ASSIGNED',
    quality: signal.quality,
    projectionPolicy: knownAlarm ? 'LATCHED_ALARM' : 'FRESH_VALUE_REQUIRED',
    valueAvailableByPolicy:
      Boolean(point) && compatible && (knownAlarm || signal.quality === 'VALID'),
    bridgeDelivery: 'NOT_CONFIRMED',
    metasysAcceptance: 'NOT_CONFIRMED' as const,
  };
}
