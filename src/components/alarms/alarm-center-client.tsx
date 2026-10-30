'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import type {
  AlarmAcknowledgement,
  AlarmOccurrenceView,
  AlarmSeverity,
  AlarmState,
} from '@/modules/alarms/domain/entities';

type StateFilter = 'ALL' | AlarmState;
type SeverityFilter = 'ALL' | AlarmSeverity;
type AckFilter = 'ALL' | AlarmAcknowledgement;

export function AlarmCenterClient({
  occurrences,
}: {
  occurrences: readonly AlarmOccurrenceView[];
}) {
  const [stateFilter, setStateFilter] = useState<StateFilter>('ACTIVE');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [ackFilter, setAckFilter] = useState<AckFilter>('ALL');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return occurrences.filter((alarm) => {
      if (stateFilter !== 'ALL' && alarm.state !== stateFilter) return false;
      if (severityFilter !== 'ALL' && alarm.severity !== severityFilter) return false;
      if (ackFilter !== 'ALL' && alarm.acknowledgement !== ackFilter) return false;
      if (!normalized) return true;

      const haystack = [
        alarm.code,
        alarm.summary,
        alarm.targetName,
        alarm.family,
        alarm.severity,
        alarm.state,
        alarm.acknowledgement,
        alarm.confidence ?? '',
        ...alarm.path.map((item) => item.name),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [occurrences, stateFilter, severityFilter, ackFilter, query]);

  return (
    <>
      <section className="alarm-center-filters" aria-label="Alarm filters">
        <label>
          State
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value as StateFilter)}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="ALL">ALL</option>
          </select>
        </label>
        <label>
          Severity
          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as SeverityFilter)}
          >
            <option value="ALL">ALL</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="WARNING">WARNING</option>
            <option value="INFO">INFO</option>
          </select>
        </label>
        <label>
          ACK
          <select
            value={ackFilter}
            onChange={(event) => setAckFilter(event.target.value as AckFilter)}
          >
            <option value="ALL">ALL</option>
            <option value="UNACKNOWLEDGED">UNACKNOWLEDGED</option>
            <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
          </select>
        </label>
        <label className="alarm-center-search">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Alarm, target or path…"
          />
        </label>
      </section>

      <section className="alarm-center-list">
        <header>
          <h2>Alarms ({filtered.length})</h2>
          <small>
            One occurrence is shown once, regardless of how many ancestor scopes display it.
          </small>
        </header>

        {filtered.length ? (
          <div className="alarm-center-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Alarm</th>
                  <th>Target</th>
                  <th>Path</th>
                  <th>Since</th>
                  <th>ACK</th>
                  <th>Confidence</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((alarm) => (
                  <tr key={alarm.id}>
                    <td>
                      <span className="alarm-severity" data-severity={alarm.severity.toLowerCase()}>
                        {alarm.severity}
                      </span>
                    </td>
                    <td>
                      <strong>{alarm.code.replaceAll('_', ' ')}</strong>
                      <small>{alarm.summary}</small>
                    </td>
                    <td>
                      <Link href={alarm.targetHref}>{alarm.targetName}</Link>
                    </td>
                    <td title={alarm.path.map((item) => item.name).join(' / ')}>
                      {alarm.path.slice(-5).map((item) => item.name).join(' / ')}
                    </td>
                    <td>{new Date(alarm.openedAt).toLocaleString()}</td>
                    <td>{alarm.acknowledgement === 'ACKNOWLEDGED' ? '✓ Yes' : 'No'}</td>
                    <td>{alarm.confidence ?? '—'}</td>
                    <td>
                      <div className="alarm-center-actions">
                        <Link href={`/alarms/${alarm.id}`}>Open detail</Link>
                        <Link href={alarm.targetHref}>Go to target →</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="alarm-empty-state">
            {stateFilter === 'ACTIVE' ? '✓ NO ACTIVE ALARMS MATCH THESE FILTERS' : 'NO ALARMS MATCH THESE FILTERS'}
          </div>
        )}
      </section>
    </>
  );
}
