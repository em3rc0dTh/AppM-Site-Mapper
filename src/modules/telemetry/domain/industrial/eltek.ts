import catalog from './profiles/eltek-rev54.json';
export interface MibDefinition {
  name: string;
  oid: string;
  kind: string;
  syntax?: string;
  enums?: Record<string, number>;
  objects?: string[];
}
const definitions = catalog.modules.flatMap((m) => m.definitions) as MibDefinition[];
const byOid = new Map(definitions.map((d) => [d.oid, d]));
export const eltekNotifications = [...byOid.values()].filter((d) => d.kind === 'NOTIFICATION-TYPE');
export function eltekDefinition(oid: string): MibDefinition | undefined {
  let candidate = oid;
  while (candidate.includes('.')) {
    const found = byOid.get(candidate);
    if (found) return found;
    candidate = candidate.slice(0, candidate.lastIndexOf('.'));
  }
  return undefined;
}
/** Derived alarm condition keys include the reported status OID and condition code.
 * Different subsystem alarms never share the generic on/off varbind's identity.
 */
export function eltekAlarm(
  varbinds: readonly { oid: string; value: unknown }[],
  notificationOid?: string,
) {
  if (notificationOid && !eltekNotifications.some((d) => d.oid === notificationOid)) {
    const equivalent = notificationOid.replace(/\.0\.(\d+)$/, '.$1');
    if (eltekNotifications.some((d) => d.oid === equivalent)) notificationOid = equivalent;
  }
  if (!eltekNotifications.some((d) => d.oid === notificationOid && d.name !== 'infoHeartBeatTrap'))
    return null;
  const byName = new Map(varbinds.map((v) => [eltekDefinition(v.oid)?.name, v.value]));
  const statusOid = byName.get('alarmSubsysStatusOid');
  const condition = byName.get('alarmSubsysStatusValue');
  const onOff = byName.get('alarmSubsysStatusOnOff');
  if (
    typeof statusOid !== 'string' ||
    !/^[0-2](?:\.[0-9]+){2,127}$/.test(statusOid) ||
    typeof condition !== 'number' ||
    !Number.isInteger(condition) ||
    ![0, 1].includes(Number(onOff)) ||
    typeof onOff !== 'number'
  )
    return null;
  return {
    key: `alarm:${statusOid}:${condition}`,
    value: onOff,
    severity:
      Object.entries(
        eltekDefinition(
          varbinds.find((v) => eltekDefinition(v.oid)?.name === 'alarmSubsysStatusValue')!.oid,
        )?.enums ?? {},
      ).find(([, value]) => value === condition)?.[0] ?? 'UNKNOWN',
  };
}

/** Trap measured-object references are explicit vendor evidence, not panel-name inference.
 * Reuse the actual measured OID identity across GET and notification paths. Scaling
 * still requires an exact commissioned profile. Original generic varbinds remain raw.
 */
export function eltekMeasuredValue(
  varbinds: readonly { oid: string; value: unknown }[],
  notificationOid?: string,
) {
  const candidate = notificationOid?.replace(/\.0\.(\d+)$/, '.$1');
  if (
    !eltekNotifications.some(
      (d) => (d.oid === notificationOid || d.oid === candidate) && d.name !== 'infoHeartBeatTrap',
    )
  )
    return null;
  const reference = varbinds.find((v) => eltekDefinition(v.oid)?.name === 'alarmMeasuredVarOid');
  const reading = varbinds.find((v) => eltekDefinition(v.oid)?.name === 'alarmMeasuredVarValue');
  if (
    !reference ||
    !reading ||
    typeof reference.value !== 'string' ||
    !/^[0-2](?:\.[0-9]+){2,127}$/.test(reference.value)
  )
    return null;
  return { oid: reference.value, value: reading.value, derivedFrom: [reference.oid, reading.oid] };
}
