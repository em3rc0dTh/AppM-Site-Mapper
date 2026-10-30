'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';
import type {
  AlarmAcknowledgement,
  AlarmFamily,
  AlarmOccurrenceView,
  AlarmSeverity,
} from '@/modules/alarm/domain/entities';

const severityRank: Record<AlarmSeverity, number> = { CRITICAL: 3, WARNING: 2, INFO: 1 };

function scopeName(alarm: AlarmOccurrenceView, kind: string): string {
  return alarm.path.find((item) => item.kind === kind)?.name ?? '';
}

export function AlarmCenter() {
  const { snapshot, loading, error, refresh } = useAlarmSnapshot(true);
  const [showResolved, setShowResolved] = useState(false);
  const [severity, setSeverity] = useState<'ALL' | AlarmSeverity>('ALL');
  const [family, setFamily] = useState<'ALL' | AlarmFamily>('ALL');
  const [ack, setAck] = useState<'ALL' | AlarmAcknowledgement>('ALL');
  const [site, setSite] = useState('ALL');
  const [qdf, setQdf] = useState('ALL');
  const [search, setSearch] = useState('');

  const sites = useMemo(
    () =>
      [...new Set(snapshot.occurrences.map((item) => scopeName(item, 'SITE')).filter(Boolean))].sort(),
    [snapshot.occurrences],
  );
  const qdfs = useMemo(
    () =>
      [
        ...new Set(
          snapshot.occurrences.map((item) => scopeName(item, 'CONTAINER_RACK')).filter(Boolean),
        ),
      ].sort(),
    [snapshot.occurrences],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return snapshot.occurrences
      .filter((item) => (showResolved ? item.lifecycle === 'RESOLVED' : item.lifecycle === 'ACTIVE'))
      .filter((item) => severity === 'ALL' || item.severity === severity)
      .filter((item) => family === 'ALL' || item.family === family)
      .filter((item) => ack === 'ALL' || item.acknowledgement === ack)
      .filter((item) => site === 'ALL' || scopeName(item, 'SITE') === site)
      .filter((item) => qdf === 'ALL' || scopeName(item, 'CONTAINER_RACK') === qdf)
      .filter((item) => {
        if (!needle) return true;
        return [
          item.name,
          item.alarmCode,
          item.sourceContext,
          item.targetId,
          item.path.map((pathItem) => pathItem.name).join(' '),
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .sort(
        (a, b) =>
          severityRank[b.severity] - severityRank[a.severity] ||
          b.openedAt.localeCompare(a.openedAt),
      );
  }, [ack, family, qdf, search, severity, showResolved, site, snapshot.occurrences]);

  return (
    <section className="sm-alarm-center">
      <header className="sm-alarm-center-heading">
        <div>
          <span>Operational alarms</span>
          <h1>Alarm Center</h1>
          <p>One occurrence, many hierarchical views. Targets own alarms; ancestors show roll-ups.</p>
        </div>
        <button type="button" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      {error ? (
        <div className="sm-alarm-unavailable" role="alert">
          Alarm status unavailable. This is not equivalent to “no alarms”.
        </div>
      ) : (
        <>
          <div className="sm-alarm-summary-grid">
            <article>
              <strong>{snapshot.global.activeAlarmCount}</strong>
              <span>Active</span>
            </article>
            <article data-severity="CRITICAL">
              <strong>{snapshot.global.critical}</strong>
              <span>Critical</span>
            </article>
            <article data-severity="WARNING">
              <strong>{snapshot.global.warning}</strong>
              <span>Warning</span>
            </article>
            <article data-severity="INFO">
              <strong>{snapshot.global.info}</strong>
              <span>Info</span>
            </article>
            <article>
              <strong>{snapshot.global.unacknowledgedCount}</strong>
              <span>Unacknowledged</span>
            </article>
          </div>

          <div className="sm-alarm-filters">
            <button
              type="button"
              aria-pressed={!showResolved}
              onClick={() => setShowResolved(false)}
            >
              Active
            </button>
            <button
              type="button"
              aria-pressed={showResolved}
              onClick={() => setShowResolved(true)}
            >
              Resolved
            </button>
            <select
              aria-label="Severity"
              value={severity}
              onChange={(event) => setSeverity(event.target.value as 'ALL' | AlarmSeverity)}
            >
              <option value="ALL">All severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Info</option>
            </select>
            <select
              aria-label="Site"
              value={site}
              onChange={(event) => setSite(event.target.value)}
            >
              <option value="ALL">All sites</option>
              {sites.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              aria-label="QDF"
              value={qdf}
              onChange={(event) => setQdf(event.target.value)}
            >
              <option value="ALL">All QDFs</option>
              {qdfs.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              aria-label="Alarm family"
              value={family}
              onChange={(event) => setFamily(event.target.value as 'ALL' | AlarmFamily)}
            >
              <option value="ALL">All families</option>
              <option value="COMMUNICATION">Communication</option>
              <option value="ELECTRICAL">Electrical</option>
              <option value="EQUIPMENT">Equipment</option>
              <option value="CORRELATED">Correlated</option>
            </select>
            <select
              aria-label="Acknowledgement"
              value={ack}
              onChange={(event) =>
                setAck(event.target.value as 'ALL' | AlarmAcknowledgement)
              }
            >
              <option value="ALL">All ACK states</option>
              <option value="UNACKNOWLEDGED">Unacknowledged</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
            </select>
            <input
              aria-label="Search alarms"
              type="search"
              placeholder="Search alarm, target or path…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
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
                    <td>
                      <span className="sm-alarm-severity">{alarm.severity}</span>
                    </td>
                    <td>
                      <strong>{alarm.name}</strong>
                      <small>{alarm.alarmCode}</small>
                    </td>
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
                  <tr>
                    <td colSpan={7}>No alarms in this view.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
