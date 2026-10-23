import type { Signal } from './observations';
/** Evidence links only. Sharing a physical target and time window does not establish causality. */
export function correlateObservations(signals: readonly Signal[], windowMs = 30000) {
  if (!Number.isInteger(windowMs) || windowMs < 0 || windowMs > 300000)
    throw new Error('Invalid correlation window');
  const links: Array<{
    leftEventId: string;
    rightEventId: string;
    targetId: string;
    relation: 'SAME_TARGET_TIME_WINDOW';
  }> = [];
  const seen = new Set<string>();
  for (const left of signals.filter((s) => s.protocol === 'SNMP' && s.targetId)) {
    for (const right of signals.filter(
      (s) => s.protocol === 'MQTT' && s.targetId === left.targetId,
    )) {
      if (Math.abs(Date.parse(left.observedAt) - Date.parse(right.observedAt)) > windowMs) continue;
      const key = `${left.eventId}:${right.eventId}`;
      if (!seen.has(key)) {
        links.push({
          leftEventId: left.eventId,
          rightEventId: right.eventId,
          targetId: left.targetId!,
          relation: 'SAME_TARGET_TIME_WINDOW',
        });
        seen.add(key);
      }
    }
  }
  return links;
}
