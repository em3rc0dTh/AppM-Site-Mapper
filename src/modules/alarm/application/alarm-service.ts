import { randomUUID } from 'node:crypto';

import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import type {
  AlarmOccurrence,
  AlarmOccurrenceView,
  AlarmRollup,
  AlarmSeverity,
  AlarmSnapshot,
} from '@/modules/alarm/domain/entities';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';

const severityRank: Readonly<Record<AlarmSeverity, number>> = {
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3,
};

function emptyRollup(): AlarmRollup {
  return {
    directAlarmIds: [],
    descendantAlarmIds: [],
    directActiveAlarmCount: 0,
    descendantActiveAlarmCount: 0,
    activeAlarmCount: 0,
    critical: 0,
    warning: 0,
    info: 0,
    unacknowledgedCount: 0,
    highestSeverity: null,
    affectedChildren: [],
  };
}

function highest(current: AlarmSeverity | null, next: AlarmSeverity): AlarmSeverity {
  return !current || severityRank[next] > severityRank[current] ? next : current;
}


function operationalAlarmPath(path: readonly AlarmOccurrenceView['path'][number][]) {
  // Alarm roll-up is intentionally bounded to the physical QDF operational
  // scope. In the current canonical topology that boundary is the nearest
  // Container/Rack ancestor. Site/Room/Building are navigational context and
  // do not become QDF alarm owners; Global Alarm Center is the cross-QDF scope.
  let rootIndex = -1;
  for (let index = 0; index < path.length; index += 1) {
    if (path[index]?.kind === 'CONTAINER_RACK') rootIndex = index;
  }
  return rootIndex >= 0 ? path.slice(rootIndex) : path;
}

function addAlarm(
  rollup: AlarmRollup,
  alarm: AlarmOccurrence,
  direct: boolean,
): AlarmRollup {
  const directIds = direct ? [...rollup.directAlarmIds, alarm.id] : [...rollup.directAlarmIds];
  const descendantIds = direct
    ? [...rollup.descendantAlarmIds]
    : [...rollup.descendantAlarmIds, alarm.id];
  return {
    ...rollup,
    directAlarmIds: directIds,
    descendantAlarmIds: descendantIds,
    directActiveAlarmCount: directIds.length,
    descendantActiveAlarmCount: descendantIds.length,
    activeAlarmCount: directIds.length + descendantIds.length,
    critical: rollup.critical + (alarm.severity === 'CRITICAL' ? 1 : 0),
    warning: rollup.warning + (alarm.severity === 'WARNING' ? 1 : 0),
    info: rollup.info + (alarm.severity === 'INFO' ? 1 : 0),
    unacknowledgedCount:
      rollup.unacknowledgedCount + (alarm.acknowledgement === 'UNACKNOWLEDGED' ? 1 : 0),
    highestSeverity: highest(rollup.highestSeverity, alarm.severity),
  };
}

export class AlarmService {
  private readonly topology: TopologyService;

  constructor(
    private readonly alarms: AlarmRepository,
    private readonly topologyRepository: TopologyRepository,
  ) {
    this.topology = new TopologyService(topologyRepository);
  }

  async snapshot(options?: {
    readonly includeResolved?: boolean;
    readonly resolvedLimit?: number;
  }): Promise<AlarmSnapshot> {
    const active = [...(await this.alarms.listActive())];
    const resolved = options?.includeResolved
      ? [...(await this.alarms.listResolved(options.resolvedLimit ?? 100))]
      : [];
    const occurrences = await Promise.all(
      [...active, ...resolved].map((item) => this.toView(item)),
    );

    const rollups: Record<string, AlarmRollup> = {};
    let global = emptyRollup();

    for (const view of occurrences.filter((item) => item.lifecycle === 'ACTIVE')) {
      global = addAlarm(global, view, false);
      const alarmPath = operationalAlarmPath(view.path);
      for (let index = 0; index < alarmPath.length; index += 1) {
        const pathItem = alarmPath[index]!;
        rollups[pathItem.id] = addAlarm(
          rollups[pathItem.id] ?? emptyRollup(),
          view,
          pathItem.id === view.targetId,
        );
      }
    }

    // Identify the immediate affected child for each ancestor. A parent may contain
    // several alarms below the same child; count unique AlarmOccurrence identities.
    for (const view of occurrences.filter((item) => item.lifecycle === 'ACTIVE')) {
      const path = operationalAlarmPath(view.path);
      for (let index = 0; index < path.length - 1; index += 1) {
        const parent = path[index]!;
        const child = path[index + 1]!;
        const current = rollups[parent.id] ?? emptyRollup();
        const existing = current.affectedChildren.find((item) => item.id === child.id);
        const affectedChildren = existing
          ? current.affectedChildren.map((item) =>
              item.id === child.id
                ? {
                    ...item,
                    activeAlarmCount: item.activeAlarmCount + 1,
                    highestSeverity: highest(item.highestSeverity, view.severity),
                  }
                : item,
            )
          : [
              ...current.affectedChildren,
              {
                id: child.id,
                name: child.name,
                href: child.href,
                activeAlarmCount: 1,
                highestSeverity: view.severity,
              },
            ];
        rollups[parent.id] = { ...current, affectedChildren };
      }
    }

    return { occurrences, rollups, global };
  }

  async getOccurrenceView(id: string): Promise<AlarmOccurrenceView | null> {
    const occurrence = await this.alarms.getOccurrence(id);
    return occurrence ? this.toView(occurrence) : null;
  }

  async acknowledge(id: string, actorId: string): Promise<AlarmOccurrence> {
    const current = await this.alarms.getOccurrence(id);
    if (!current) throw new Error('ALARM_NOT_FOUND');
    if (current.lifecycle !== 'ACTIVE') throw new Error('ALARM_NOT_ACTIVE');
    if (current.acknowledgement === 'ACKNOWLEDGED') return current;

    const now = new Date().toISOString();
    const next: AlarmOccurrence = {
      ...current,
      acknowledgement: 'ACKNOWLEDGED',
      acknowledgedAt: now,
      acknowledgedBy: actorId,
      updatedAt: now,
    };
    await this.alarms.replaceOccurrence(next);
    await this.alarms.insertTransition({
      id: randomUUID(),
      alarmOccurrenceId: id,
      fromState: 'UNACKNOWLEDGED',
      toState: 'ACKNOWLEDGED',
      occurredAt: now,
      reason: 'OPERATOR_ACKNOWLEDGED',
      evidenceRefs: [],
      actorId,
    });
    return next;
  }

  async transitions(id: string) {
    return this.alarms.listTransitions(id);
  }

  private async toView(occurrence: AlarmOccurrence): Promise<AlarmOccurrenceView> {
    const target = await this.topologyRepository.getById(occurrence.targetId);
    const pathNodes = target ? await this.topology.getTrail(target.id) : [];
    const path = await Promise.all(
      pathNodes.map(async (node) => ({
        id: node.id,
        name: node.name,
        kind: node.kind,
        href: await this.topology.buildDeepLink(node.id),
      })),
    );
    return {
      ...occurrence,
      path,
      targetHref: target ? await this.topology.buildDeepLink(target.id) : '#',
    };
  }
}
