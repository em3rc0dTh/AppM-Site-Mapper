/** SNMP protocol-agnostic measurement conversion; OID ownership is in Site Mapper. */
export function pointsFromEnvironment(value) {
  let parsed;
  try {
    parsed = JSON.parse(value ?? '');
  } catch {
    throw new Error('SNMP_FEED_POINTS_JSON must be valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 64)
    throw new Error('SNMP_FEED_POINTS_JSON must describe 1..64 points');

  const unique = new Set();
  return parsed.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error('Invalid SNMP point');
    const { oid, metric, scale = 1 } = entry;
    if (typeof oid !== 'string' || !/^\d+(?:\.\d+){5,}$/.test(oid) || oid.length > 256)
      throw new Error('Invalid SNMP OID');
    if (metric !== 'CURRENT' && metric !== 'VOLTAGE')
      throw new Error('SNMP point metric must be CURRENT or VOLTAGE');
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale === 0 || Math.abs(scale) > 1_000_000)
      throw new Error('SNMP engineering scale must be a non-zero number');
    const key = `${oid}:${metric}`;
    if (unique.has(key)) throw new Error('Duplicate SNMP OID and metric');
    unique.add(key);
    return { oid, metric, scale };
  });
}

export function normalizeVarbinds(points, varbinds, observedAt, sourceIdentity) {
  if (points.length !== varbinds.length)
    throw new Error('SNMP GET returned unexpected point count');
  const measurements = points.map((point, i) => {
    const varbind = varbinds[i];
    if (!varbind || varbind.oid !== point.oid) throw new Error('SNMP GET OID mismatch');
    const raw = Buffer.isBuffer(varbind.value) ? varbind.value.toString('utf8') : varbind.value;
    // Never coerce null, empty strings, booleans or objects into a fictitious 0 A.
    // Vendor ASCII numeric scalars are supported, but only in strict decimal form.
    let number;
    if (typeof raw === 'number' || typeof raw === 'bigint') {
      number = Number(raw);
    } else if (typeof raw === 'string' &&
      /^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$/.test(raw.trim())) {
      number = Number(raw.trim());
    } else {
      throw new Error('Unsupported SNMP scalar value type');
    }
    const value = number * point.scale;
    if (!Number.isFinite(value) || Math.abs(value) > 100_000_000)
      throw new Error('Unsupported SNMP value or engineering scale');
    if (point.metric === 'CURRENT' && value < 0)
      throw new Error('Negative feed current is not supported by the input-load contract');
    return {
      oid: point.oid,
      metric: point.metric,
      value,
      unit: point.metric === 'CURRENT' ? 'A' : 'V',
    };
  });
  return { schemaVersion: 1, sourceIdentity, observedAt, measurements };
}
