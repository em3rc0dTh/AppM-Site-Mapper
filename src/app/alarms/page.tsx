import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAlarmSnapshot } from '@/modules/alarms/application/alarm-preview-service';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const dynamic = 'force-dynamic';

export default async function AlarmCenterPage() {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) redirect('/login');

  const repository = await createTopologyRepository();
  const snapshot = await getAlarmSnapshot(repository);
  const active = snapshot.occurrences.filter((item) => item.state === 'ACTIVE');
  const critical = active.filter((item) => item.severity === 'CRITICAL').length;
  const warning = active.filter((item) => item.severity === 'WARNING').length;
  const info = active.filter((item) => item.severity === 'INFO').length;
  const unack = active.filter((item) => item.acknowledgement === 'UNACKNOWLEDGED').length;

  return (
    <main className="alarm-center-page">
      <header className="alarm-center-heading">
        <div>
          <span>⚠ OPERATIONAL ALARMS</span>
          <h1>Alarm Center</h1>
          <p>Active incidents across the physical infrastructure hierarchy.</p>
        </div>
        {snapshot.preview ? <strong>LAB PREVIEW · seed-01</strong> : null}
      </header>

      <section className="alarm-center-filters" aria-label="Alarm filters">
        <label>
          State
          <select defaultValue="ACTIVE">
            <option>ACTIVE</option>
            <option>RESOLVED</option>
          </select>
        </label>
        <label>
          Severity
          <select defaultValue="ALL">
            <option>ALL</option>
            <option>CRITICAL</option>
            <option>WARNING</option>
            <option>INFO</option>
          </select>
        </label>
        <label>
          ACK
          <select defaultValue="ALL">
            <option>ALL</option>
            <option>UNACKNOWLEDGED</option>
            <option>ACKNOWLEDGED</option>
          </select>
        </label>
        <label className="alarm-center-search">
          Search
          <input placeholder="Alarm, target or path…" />
        </label>
      </section>

      <section className="alarm-center-stats">
        <article><b>{active.length}</b><span>Active</span></article>
        <article><b>{unack}</b><span>Without ACK</span></article>
        <article data-severity="critical"><b>{critical}</b><span>Critical</span></article>
        <article data-severity="warning"><b>{warning}</b><span>Warning</span></article>
        <article data-severity="info"><b>{info}</b><span>Info</span></article>
      </section>

      <section className="alarm-center-list">
        <header>
          <h2>Active alarms ({active.length})</h2>
          <small>One occurrence is shown once, regardless of how many ancestor scopes display it.</small>
        </header>

        {active.length ? (
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
                {active.map((alarm) => (
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
          <div className="alarm-empty-state">✓ NO ACTIVE ALARMS</div>
        )}
      </section>
    </main>
  );
}
