import Link from 'next/link';

import type {
  AlarmOccurrenceView,
  AlarmRollup,
  AlarmSnapshotView,
} from '@/modules/alarms/domain/entities';

function total(rollup: AlarmRollup | undefined): number {
  return rollup ? rollup.directCount + rollup.descendantCount : 0;
}

function tone(rollup: AlarmRollup | undefined): string {
  return rollup?.highestSeverity?.toLowerCase() ?? 'none';
}

export function AlarmBadge({ rollup }: { rollup?: AlarmRollup }) {
  const count = total(rollup);
  if (!count) return null;
  return (
    <span
      className="alarm-badge"
      data-severity={tone(rollup)}
      title={`${count} active alarm${count === 1 ? '' : 's'}`}
    >
      <span aria-hidden="true">!</span>
      {count}
    </span>
  );
}

function occurrenceLabel(alarm: AlarmOccurrenceView) {
  return alarm.code.replaceAll('_', ' ');
}

export function AlarmHomeSummary({ snapshot }: { snapshot: AlarmSnapshotView }) {
  if (!snapshot.occurrences.length) return null;
  const critical = snapshot.occurrences.filter((item) => item.severity === 'CRITICAL').length;
  const warning = snapshot.occurrences.filter((item) => item.severity === 'WARNING').length;
  const info = snapshot.occurrences.filter((item) => item.severity === 'INFO').length;

  return (
    <section className="alarm-home-summary" aria-label="Active alarms">
      <header>
        <div>
          <strong>⚠ ACTIVE ALARMS</strong>
          {snapshot.preview ? <small>LAB PREVIEW</small> : null}
        </div>
        <Link href="/alarms">View all alarms →</Link>
      </header>
      <div className="alarm-home-counts">
        <span data-severity="critical"><b>{critical}</b> Critical</span>
        <span data-severity="warning"><b>{warning}</b> Warning</span>
        <span data-severity="info"><b>{info}</b> Info</span>
      </div>
      <div className="alarm-home-table">
        {snapshot.occurrences.slice(0, 3).map((alarm) => (
          <article key={alarm.id}>
            <div>
              <strong>{occurrenceLabel(alarm)}</strong>
              <small>{alarm.summary}</small>
            </div>
            <span className="alarm-severity" data-severity={alarm.severity.toLowerCase()}>
              {alarm.severity}
            </span>
            <small className="alarm-path" title={alarm.path.map((item) => item.name).join(' / ')}>
              {alarm.path.slice(-6).map((item) => item.name).join(' / ')}
            </small>
            <Link href={alarm.targetHref}>Go to target →</Link>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AlarmScopeBanner({
  snapshot,
  nodeId,
}: {
  snapshot: AlarmSnapshotView;
  nodeId: string;
}) {
  const rollup = snapshot.rollups[nodeId];
  const count = total(rollup);
  if (!count) return null;

  const alarms = snapshot.occurrences.filter((item) => rollup.occurrenceIds.includes(item.id));
  const direct = alarms.filter((item) => item.targetId === nodeId);
  const descendants = alarms.filter((item) => item.targetId !== nodeId);

  return (
    <section className="alarm-scope-banner" data-severity={tone(rollup)} aria-label="Alarm status">
      <div className="alarm-scope-title">
        <strong>
          ⚠ {count} active alarm{count === 1 ? '' : 's'}
        </strong>
        {snapshot.preview ? <small>LAB PREVIEW</small> : null}
      </div>
      <div className="alarm-scope-counts">
        {rollup.critical > 0 ? <span data-severity="critical">● {rollup.critical} Critical</span> : null}
        {rollup.warning > 0 ? <span data-severity="warning">▲ {rollup.warning} Warning</span> : null}
        {rollup.info > 0 ? <span data-severity="info">● {rollup.info} Info</span> : null}
      </div>
      <div className="alarm-scope-links">
        {direct.slice(0, 2).map((alarm) => (
          <Link key={alarm.id} href={`/alarms/${alarm.id}`}>
            {occurrenceLabel(alarm)} · this equipment →
          </Link>
        ))}
        {descendants.slice(0, 3).map((alarm) => (
          <Link key={alarm.id} href={alarm.targetHref}>
            {alarm.targetName} · {occurrenceLabel(alarm)} →
          </Link>
        ))}
      </div>
    </section>
  );
}

export function AlarmInspectorCard({
  snapshot,
  nodeId,
}: {
  snapshot: AlarmSnapshotView;
  nodeId: string;
}) {
  const rollup = snapshot.rollups[nodeId];
  const count = total(rollup);
  if (!count) return null;
  const alarms = snapshot.occurrences.filter((item) => rollup.occurrenceIds.includes(item.id));

  return (
    <section className="alarm-inspector-card" data-severity={tone(rollup)}>
      <header>
        <strong>ALARMS</strong>
        <span>{count} active</span>
      </header>
      <div className="alarm-inspector-counts">
        {rollup.critical > 0 ? <b data-severity="critical">{rollup.critical} Critical</b> : null}
        {rollup.warning > 0 ? <b data-severity="warning">{rollup.warning} Warning</b> : null}
        {rollup.info > 0 ? <b data-severity="info">{rollup.info} Info</b> : null}
      </div>
      {alarms.slice(0, 4).map((alarm) => (
        <Link
          key={alarm.id}
          className="alarm-inspector-row"
          href={alarm.targetId === nodeId ? `/alarms/${alarm.id}` : alarm.targetHref}
        >
          <span data-severity={alarm.severity.toLowerCase()} aria-hidden="true">!</span>
          <div>
            <strong>{occurrenceLabel(alarm)}</strong>
            <small>{alarm.targetId === nodeId ? 'Direct alarm' : `Descendant · ${alarm.targetName}`}</small>
          </div>
          <b>›</b>
        </Link>
      ))}
      <Link className="alarm-inspector-all" href="/alarms">View all alarms →</Link>
    </section>
  );
}
