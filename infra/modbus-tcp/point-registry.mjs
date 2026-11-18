import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { floatRegisters } from './server.mjs';

export const QUALITY_CODES = Object.freeze({
  UNOBSERVED: 0,
  VALID: 1,
  STALE: 2,
  INVALID: 3,
  UNKNOWN: 4,
  OFFLINE: 5,
});

const DATA_TYPES = Object.freeze(['FLOAT32', 'UINT16']);

function pointDataType(point) {
  return point.dataType ?? 'FLOAT32';
}

function pointWidth(point) {
  return pointDataType(point) === 'UINT16' ? 1 : 3;
}

export function validateRegistry(registry, previous) {
  if (
    !registry ||
    !Number.isInteger(registry.version) ||
    registry.version < 1 ||
    !Array.isArray(registry.points) ||
    registry.points.length > 10000
  )
    throw new Error('Invalid Modbus registry');
  const occupied = new Set(),
    signals = new Set();
  for (const p of registry.points) {
    const dataType = pointDataType(p);
    const width = pointWidth(p);
    if (
      !p ||
      !/^[a-f0-9]{64}$/.test(p.signalId) ||
      signals.has(p.signalId) ||
      !Number.isInteger(p.unitId) ||
      p.unitId < 1 ||
      p.unitId > 247 ||
      !Number.isInteger(p.address) ||
      p.address < 1024 ||
      p.address + width > 65536 ||
      typeof p.description !== 'string' ||
      typeof p.unit !== 'string' ||
      !DATA_TYPES.includes(dataType) ||
      (p.legacyTotalMirror !== undefined && typeof p.legacyTotalMirror !== 'boolean') ||
      (p.logicalPointId !== undefined &&
        (typeof p.logicalPointId !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(p.logicalPointId)))
    )
      throw new Error('Invalid Modbus point');
    signals.add(p.signalId);
    for (let i = 0; i < width; i++) {
      const address = `${p.unitId}:${p.address + i}`;
      if (occupied.has(address)) throw new Error('Overlapping Modbus points');
      occupied.add(address);
    }
  }
  if (previous) {
    if (registry.version < previous.version) throw new Error('Modbus registry version regression');
    for (const old of previous.points) {
      const next = registry.points.find((p) => p.signalId === old.signalId);
      if (!next || JSON.stringify(next) !== JSON.stringify(old))
        throw new Error('Published Modbus points are immutable');
    }
    if (registry.points.length !== previous.points.length && registry.version <= previous.version)
      throw new Error('Modbus extension requires a new version');
  }
  return registry;
}

export function pinRegistry(registry, path) {
  let previous;
  try {
    previous = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  validateRegistry(registry, previous);
  writeFileSync(path + '.tmp', JSON.stringify(registry), { mode: 0o600 });
  renameSync(path + '.tmp', path);
  return registry;
}

export class ExtensionState {
  constructor(registry) {
    this.registry = validateRegistry(registry);
    this.signals = new Map();
  }

  apply(signal) {
    if (
      !signal ||
      !this.registry.points.some((p) => p.signalId === signal.id) ||
      !Object.hasOwn(QUALITY_CODES, signal.quality) ||
      !Number.isFinite(Date.parse(signal.receivedAt)) ||
      !Number.isFinite(Date.parse(signal.observedAt)) ||
      !Number.isInteger(signal.staleMs) ||
      signal.staleMs < 1000
    )
      return false;
    const old = this.signals.get(signal.id);
    if (old && (old.authorityRegistryVersion ?? 0) > (signal.authorityRegistryVersion ?? 0))
      return false;
    if (
      old &&
      (old.authorityRegistryVersion ?? 0) === (signal.authorityRegistryVersion ?? 0) &&
      Date.parse(old.observedAt) > Date.parse(signal.observedAt)
    )
      return false;
    // Changing authority does not resolve an already observed alarm. Keep its last
    // explicit state until the authorized replacement supplies ACTIVE or RESOLVED.
    const retainAlarm =
      old?.kind === 'alarm' &&
      ['ACTIVE', 'RESOLVED'].includes(old.alarmState) &&
      (signal.quality === 'UNOBSERVED' ||
        (signal.kind === 'alarm' && !['ACTIVE', 'RESOLVED'].includes(signal.alarmState)));
    this.signals.set(
      signal.id,
      retainAlarm
        ? {
            ...signal,
            kind: 'alarm',
            alarmState: old.alarmState,
            alarmObservedAt: old.alarmObservedAt ?? old.observedAt,
          }
        : { ...signal },
    );
    return true;
  }

  read(unit, offset, count, now = Date.now()) {
    if (
      !Number.isInteger(offset) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 125 ||
      offset + count > 65536
    )
      return null;
    const values = [];
    for (let addr = offset; addr < offset + count; addr++) {
      const point = this.registry.points.find(
        (p) => p.unitId === unit && addr >= p.address && addr < p.address + pointWidth(p),
      );
      if (!point) return null;

      const dataType = pointDataType(point);
      const signal = this.signals.get(point.signalId);
      let quality = signal?.quality ?? 'UNOBSERVED';
      if (
        signal &&
        now - Math.min(Date.parse(signal.receivedAt), Date.parse(signal.observedAt)) >
          signal.staleMs &&
        quality === 'VALID'
      )
        quality = 'STALE';

      const raw =
        signal?.kind === 'alarm'
          ? signal.alarmState === 'ACTIVE'
            ? 1
            : signal.alarmState === 'RESOLVED'
              ? 0
              : NaN
          : typeof signal?.value === 'boolean'
            ? Number(signal.value)
            : signal?.value;
      let value = typeof raw === 'number' && Number.isFinite(raw) ? raw : NaN;

      if (signal && signal.unit !== point.unit && signal.kind === 'measurement')
        quality = 'INVALID';
      if (quality === 'VALID' && !Number.isFinite(value)) quality = 'INVALID';

      // Alarm state is latched evidence, independent of transport freshness.
      // FLOAT32 points keep their adjacent quality register. UINT16 status points
      // intentionally carry only the customer-facing integer code.
      const knownAlarm =
        signal?.kind === 'alarm' && ['ACTIVE', 'RESOLVED'].includes(signal.alarmState);
      if (quality !== 'VALID' && !knownAlarm) value = NaN;

      if (dataType === 'UINT16') {
        values.push(
          Number.isInteger(value) && value >= 0 && value <= 0xffff
            ? value
            : 0,
        );
        continue;
      }

      if (Number.isFinite(value) && !Number.isFinite(Math.fround(value))) {
        quality = 'INVALID';
        value = NaN;
      }
      values.push(
        addr === point.address + 2
          ? QUALITY_CODES[quality]
          : floatRegisters(value)[addr - point.address],
      );
    }
    return values;
  }
}

export function registryCsv(registry) {
  const quote = (v) =>
    '"' +
    String(v)
      .replace(/^[=+@-]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  return [
    [
      'version',
      'signalId',
      'logicalPointId',
      'unitId',
      'functionCode',
      'address0',
      'reference1',
      'dataType',
      'wordOrder',
      'qualityAddress0',
      'unit',
      'description',
      'qualityCodes',
      'alarmStatePolicy',
    ],
    ...registry.points.map((p) => {
      const dataType = pointDataType(p);
      return [
        registry.version,
        p.signalId,
        p.logicalPointId ?? 'See approved logical alias registry',
        p.unitId,
        4,
        p.address,
        40001 + p.address,
        dataType,
        dataType === 'FLOAT32' ? 'ABCD' : '',
        dataType === 'FLOAT32' ? p.address + 2 : '',
        p.unit,
        p.description,
        dataType === 'FLOAT32'
          ? '0=UNOBSERVED;1=VALID;2=STALE;3=INVALID;4=UNKNOWN;5=OFFLINE'
          : '',
        'Known alarm state retained as ACTIVE=1 or RESOLVED=0; UINT16 status points publish the integer value directly',
      ];
    }),
  ]
    .map((row) => row.map(quote).join(','))
    .join('\r\n');
}
