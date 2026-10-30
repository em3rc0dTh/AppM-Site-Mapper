import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { EquipmentNode, TopologyNode } from '@/modules/topology/domain/entities';
import {
  EMPTY_ALARM_ROLLUP,
  severityRank,
  type AlarmOccurrenceView,
  type AlarmRollup,
  type AlarmSeverity,
  type AlarmSnapshotView,
} from '@/modules/alarms/domain/entities';
import { previewAcknowledgement } from '@/modules/alarms/infrastructure/alarm-preview-runtime';

function previewEnabled(): boolean {
  return process.env.APP_ENV !== 'production' && process.env.SITE_MAPPER_SEED_PROFILE === 'seed-01';
}

async function pathFor(
  repository: TopologyRepository,
  topology: TopologyService,
  target: TopologyNode,
): Promise<readonly AlarmOccurrenceView['path'][number][]> {
  const chain: TopologyNode[] = [];
  const seen = new Set<string>();
  let current: TopologyNode | null = target;

  while (current && !seen.has(current.id)) {
    chain.push(current);
    seen.add(current.id);
    current = current.parentId ? await repository.getById(current.parentId) : null;
  }

  chain.reverse();

  return Promise.all(
    chain.map(async (node) => ({
      id: node.id,
      name: node.name,
      kind: node.kind,
      href:
        node.kind === 'EQUIPMENT'
          ? `/device/${node.id}`
          : node.kind === 'CONTAINER_RACK'
            ? `/rack/${node.id}`
            : await topology.buildDeepLink(node.id),
    })),
  );
}

function emptyMutable() {
  return {
    directCount: 0,
    descendantCount: 0,
    critical: 0,
    warning: 0,
    info: 0,
    unacknowledged: 0,
    highestSeverity: null as AlarmSeverity | null,
    occurrenceIds: [] as string[],
    affectedChildIds: [] as string[],
  };
}

function addSeverity(rollup: ReturnType<typeof emptyMutable>, severity: AlarmSeverity) {
  if (severity === 'CRITICAL') rollup.critical += 1;
  else if (severity === 'WARNING') rollup.warning += 1;
  else rollup.info += 1;

  if (!rollup.highestSeverity || severityRank(severity) > severityRank(rollup.highestSeverity)) {
    rollup.highestSeverity = severity;
  }
}

function buildRollups(
  occurrences: readonly AlarmOccurrenceView[],
): Readonly<Record<string, AlarmRollup>> {
  const rollups = new Map<string, ReturnType<typeof emptyMutable>>();

  for (const occurrence of occurrences) {
    occurrence.path.forEach((segment, index) => {
      const rollup = rollups.get(segment.id) ?? emptyMutable();
      const isTarget = segment.id === occurrence.targetId;

      if (isTarget) rollup.directCount += 1;
      else rollup.descendantCount += 1;

      addSeverity(rollup, occurrence.severity);
      if (occurrence.acknowledgement === 'UNACKNOWLEDGED') rollup.unacknowledged += 1;
      if (!rollup.occurrenceIds.includes(occurrence.id)) rollup.occurrenceIds.push(occurrence.id);

      const next = occurrence.path[index + 1];
      if (next && !rollup.affectedChildIds.includes(next.id)) {
        rollup.affectedChildIds.push(next.id);
      }

      rollups.set(segment.id, rollup);
    });
  }

  return Object.fromEntries(
    [...rollups.entries()].map(([id, value]) => [
      id,
      {
        ...EMPTY_ALARM_ROLLUP,
        ...value,
        occurrenceIds: [...value.occurrenceIds],
        affectedChildIds: [...value.affectedChildIds],
      },
    ]),
  );
}

export async function getAlarmSnapshot(repository: TopologyRepository): Promise<AlarmSnapshotView> {
  if (!previewEnabled()) return { preview: false, occurrences: [], rollups: {} };

  const topology = new TopologyService(repository);
  const equipment = (await repository.listByKind('EQUIPMENT')).filter(
    (node): node is EquipmentNode => node.kind === 'EQUIPMENT' && node.lifecycle === 'ACTIVE',
  );

  const findEquipment = (name: string) =>
    equipment.find(
      (item) =>
        item.name.toUpperCase() === name.toUpperCase() ||
        item.aliases?.some((alias) => alias.toUpperCase() === name.toUpperCase()),
    ) ?? null;

  const definitions = [
    {
      id: 'lab-preview-power-loss-a3-04',
      target: findEquipment('A3-04'),
      code: 'POWER_LOSS',
      family: 'CORRELATED' as const,
      severity: 'CRITICAL' as const,
      confidence: 'CONFIRMED' as const,
      openedAt: '2026-10-30T02:29:19.825Z',
      summary: 'Power loss',
      remarks: 'LAB preview: correlated electrical alarm on the commissioned breaker target.',
    },
    {
      id: 'lab-preview-telemetry-loss-a3-03',
      target: findEquipment('A3-03'),
      code: 'TELEMETRY_LOSS',
      family: 'COMMUNICATION' as const,
      severity: 'WARNING' as const,
      openedAt: '2026-10-30T02:28:05.000Z',
      summary: 'Telemetry loss',
      remarks:
        'LAB preview: source freshness degraded; last-known values remain distinct from zero.',
    },
  ];

  const occurrences: AlarmOccurrenceView[] = [];

  for (const definition of definitions) {
    if (!definition.target) continue;
    const path = await pathFor(repository, topology, definition.target);
    const ack = previewAcknowledgement(definition.id);

    occurrences.push({
      id: definition.id,
      code: definition.code,
      family: definition.family,
      severity: definition.severity,
      state: 'ACTIVE',
      ...('confidence' in definition && definition.confidence
        ? { confidence: definition.confidence }
        : {}),
      acknowledgement: ack ? 'ACKNOWLEDGED' : 'UNACKNOWLEDGED',
      targetId: definition.target.id,
      targetName: definition.target.name,
      targetHref: `/device/${definition.target.id}`,
      openedAt: definition.openedAt,
      summary: definition.summary,
      remarks: definition.remarks,
      path,
      preview: true,
    });
  }

  return {
    preview: true,
    occurrences,
    rollups: buildRollups(occurrences),
  };
}

export function alarmsForScope(snapshot: AlarmSnapshotView, nodeId: string) {
  const ids = new Set(snapshot.rollups[nodeId]?.occurrenceIds ?? []);
  return snapshot.occurrences.filter((item) => ids.has(item.id));
}
