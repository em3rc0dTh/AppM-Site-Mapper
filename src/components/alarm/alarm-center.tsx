'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';
import type { AlarmSeverity } from '@/modules/alarm/domain/entities';

const severityRank: Record<AlarmSeverity, number> = { CRITICAL: 3, WARNING: 2, INFO: 1 };

export function AlarmCenter() {
  const { snapshot, loading, error, refresh } = useAlarmSnapshot(true);
  const [showResolved, setShowResolved] = useState(false);
  const [severity, setSeverity] = useState<'ALL' | AlarmSeverity>('ALL');

  const rows = useMemo(
    () =>
      snapshot.occurrences
        .filter((item) => (showResolved ? item.lifecycle === 'RESOLVED' : item.lifecycle === 'ACTIVE'))
        .filter((item) => severity === 'ALL' || item.severity === severity)
        .sort(
          (a, b) =>
            severityRank[b.severity] - severityRank[a.severity] ||
            b.openedAt.localeCompare(a.openedAt),
        ),
    [snapshot.occurrences, severity, showResolved],
  );

  return (
    <section className="sm-alarm-center">
      <header className="sm-alarm-center-heading">
        <div>
          <span>Operational alarms</span>
          <h1>Alarm Center</h1>
          <p>One occurrence, many hierarchical views. Targets own alarms; ancestors show roll-ups.</p>
        </div>
        <button type="button" onClick={() => void refresh()}>Refresh</button>
      </header>

      {error ? (
        <div className="sm-alarm-unavailable" role="alert">
          Alarm status unavailable. This is not equivalent to “no alarms”.
        </div>
      ) : (
        <>
          <div className="sm-alarm-summary-grid">
            <article><strong>{snapshot.global.activeAlarmCount}</strong><span>Active</span></article>
            <article data-severity="CRITICAL"><strong>{snapshot.global.critical}</strong><span>Critical</span></article>
            <article data-severity="WARNING"><strong>{snapshot.global.warning}</strong><span>Warning</span></article>
            <article data-severity="INFO"><strong>{snapshot.global.info}</strong><span>Info</span></article>
            <article><strong>{snapshot.global.unacknowledgedCount}</strong><span>Unacknowledged</span></article>
          </div>

          <div className="sm-alarm-filters">
            <button type="button" aria-pressed={!showResolved} onClick={() => setShowResolved(false)}>Active</button>
            <button type="button" aria-pressed={showResolved} onClick={() => setShowResolved(true)}>Resolved</button>
            <select value={severity} onChange={(event) => setSeverity(event.target.value as 'ALL' | AlarmSeverity)}>
              <option value="ALL">All severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Info</option>
            </select>
          </div>

          <div className="sm-alarm-table-wrap">
            <table className="sm-alarm-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Alarm</th>
                  <th>Target path</th>
                  <th>Since</th>
                  <th>ACK</th>
                  <th>Confidence</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((alarm) => (
                  <tr key={alarm.id} data-severity={alarm.severity}>
                    <td><span className="sm-alarm-severity">{alarm.severity}</span></td>
                    <td><strong>{alarm.name}</strong><small>{alarm.alarmCode}</small></td>
                    <td>{alarm.path.map((item) => item.name).join(' › ') || alarm.targetId}</td>
                    <td>{new Date(alarm.openedAt).toLocaleString()}</td>
                    <td>{alarm.acknowledgement === 'ACKNOWLEDGED' ? 'ACK' : '—'}</td>
                    <td>{alarm.confidence ?? '—'}</td>
                    <td>
                      <Link href={'/alarms/' + encodeURIComponent(alarm.id)}>Open detail</Link>
                      {' · '}
                      <Link href={alarm.targetHref}>Go to target</Link>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 ? (
                  <tr><td colSpan={7}>No alarms in this view.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
