// Canonical, read-only Site Mapper Modbus TCP register contract.
// No Vertiv addresses or battery-only data are inherited.
export const CIRCUITS = 96;
export const METRIC_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'voltageV', label: 'Voltage', unit: 'V' }),
  Object.freeze({ key: 'currentA', label: 'Current', unit: 'A' }),
  Object.freeze({ key: 'powerW', label: 'Power', unit: 'W' }),
  Object.freeze({ key: 'energyKwh', label: 'Energy', unit: 'kWh' }),
]);
export const METRICS = Object.freeze(METRIC_DEFINITIONS.map((metric) => metric.key));
export const REGISTERS_PER_METRIC = 2;
export const REGISTERS_PER_CIRCUIT = METRIC_DEFINITIONS.length * REGISTERS_PER_METRIC;
export const REGISTERS_PER_UNIT = CIRCUITS * REGISTERS_PER_CIRCUIT;
export const POINT_LAYOUTS = Object.freeze(['blocks-2x48', 'panels-4x24']);

export function circuitStartAddress(circuit) {
  if (!Number.isInteger(circuit) || circuit < 1 || circuit > CIRCUITS) {
    throw new RangeError('Circuit must be in 1..96');
  }
  return (circuit - 1) * REGISTERS_PER_CIRCUIT;
}

export function metricStartAddress(circuit, metricKey) {
  const index = METRICS.indexOf(metricKey);
  if (index === -1) throw new RangeError('Unknown Modbus metric');
  return circuitStartAddress(circuit) + index * REGISTERS_PER_METRIC;
}

export function pointIdForCircuit(circuit, pointLayout = 'panels-4x24') {
  circuitStartAddress(circuit);
  if (!POINT_LAYOUTS.includes(pointLayout)) throw new RangeError('Invalid point layout');
  const width = pointLayout === 'panels-4x24' ? 24 : 48;
  return `0_${Math.floor((circuit - 1) / width) + 1}_${((circuit - 1) % width) + 1}`;
}

export function rawPointIndex(rawPointId, pointLayout = 'blocks-2x48') {
  if (pointLayout === 'panels-4x24') {
    const match = /^0_([1-4])_([1-9]|1[0-9]|2[0-4])$/.exec(rawPointId);
    return match ? (Number(match[1]) - 1) * 24 + Number(match[2]) - 1 : null;
  }
  if (pointLayout === 'blocks-2x48') {
    const match = /^0_([12])_([1-9]|[1-3][0-9]|4[0-8])$/.exec(rawPointId);
    return match ? (Number(match[1]) - 1) * 48 + Number(match[2]) - 1 : null;
  }
  throw new Error('MODBUS_POINT_LAYOUT must be blocks-2x48 or panels-4x24');
}

export function registerMapRows(sourceUnits, pointLayout = 'panels-4x24') {
  if (!POINT_LAYOUTS.includes(pointLayout)) throw new RangeError('Invalid point layout');
  if (!sourceUnits || typeof sourceUnits !== 'object' || Array.isArray(sourceUnits)) {
    throw new TypeError('Source-to-Unit-ID object required');
  }
  const identities = Object.entries(sourceUnits);
  const used = new Set();
  if (!identities.length || identities.length > 247) throw new RangeError('Invalid source count');
  for (const [source, unit] of identities) {
    if (!source || !Number.isInteger(unit) || unit < 1 || unit > 247 || used.has(unit)) {
      throw new RangeError('Each source must have a unique Unit ID from 1 to 247');
    }
    used.add(unit);
  }
  const rows = [];
  for (const [source, unit] of identities.sort((a, b) => a[1] - b[1])) {
    for (let circuit = 1; circuit <= CIRCUITS; circuit++) {
      for (const metric of METRIC_DEFINITIONS) {
        const address = metricStartAddress(circuit, metric.key);
        const hex = (value) => value.toString(16).toUpperCase().padStart(4, '0') + 'H';
        rows.push({
          category: 'Circuit Measurements',
          description: `Circuit ${String(circuit).padStart(2, '0')} ${metric.label}`,
          reference: `${40001 + address}-${40002 + address}`,
          dataAddress: `${hex(address)}-${hex(address + 1)}`,
          startAddress: address,
          unitId: unit,
          sourceIdentity: source,
          circuit,
          rawPoint: pointIdForCircuit(circuit, pointLayout),
          functionCode: '03',
          dataType: 'FLOAT32',
          registerCount: REGISTERS_PER_METRIC,
          engineeringUnit: metric.unit,
          scale: 1,
          wordOrder: 'High word first',
        });
      }
    }
  }
  return rows;
}
