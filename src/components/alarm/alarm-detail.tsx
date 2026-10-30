'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type {
  AlarmOccurrenceView,
  AlarmTransition,
} from '@/modules/alarm/domain/entities';

export function AlarmDetail({ id, canAck }: { readonly id: string; readonly canAck: boolean }) {
  const [occurrence, setOccurrence] = useState<AlarmOccurrenceView | null>(null);
  const [transitions, setTransitions] = useState<readonly AlarmTransition[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/alarms/' + encodeURIComponent(id), { cache: 'no-store' });
    if (!response.ok) throw new Error('ALARM_NOT_FOUND');
    const payload = (await response.json()) as {
      occurrence: AlarmOccurrenceView;
      transitions: readonly AlarmTransition[];
    };
    setOccurrence(payload.occurrence);
    setTransitions(payload.transitions);
  }

  useEffect(() => {
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'LOAD_FAILED'));
  }, [id]);

  async function acknowledge() {
    if (!occurrence || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/alarms/' + encodeURIComponent(id) + '/ack', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('ACK_FAILED');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ACK_FAILED');
    } finally {
      setBusy(false);
    }
  }

  if (error && !occurrence) return <div className="sm-alarm-unavailable">{error}</div>;
  if (!occurrence) return <div className="sm-alarm-detail">Loading alarm…</div>;

  return (
    <section className="sm-alarm-detail" data-severity={occurrence.severity}>
      <header className="sm-alarm-detail-hero">
        <div>
          <span>{occurrence.family}</span>
          <h1>{occurrence.name}</h1>
          <p>{occurrence.severity} · {occurrence.lifecycle} · {occurrence.confidence ?? '—'} · {occurrence.acknowledgement}</p>
        </div>
        <div>
          {canAck && occurrence.lifecycle === 'ACTIVE' && occurrence.acknowledgement === 'UNACKNOWLEDGED' ? (
            <button type="button" disabled={busy} onClick={() => void acknowledge()}>
              {busy ? 'Acknowledging…' : 'Acknowledge'}
            </button>
          ) : null}
          <Link href={occurrence.targetHref}>Go to target →</Link>
        </div>
      </header>

      <section className="sm-alarm-detail-path">
        <small>TARGET</small>
        <div>
          {occurrence.path.map((item, index) => (
            <span key={item.id}>
              {index > 0 ? ' › ' : ''}
              <Link href={item.href}>{item.name}</Link>
            </span>
          ))}
        </div>
      </section>

      <div className="sm-alarm-detail-grid">
        <section>
          <h2>Evidence</h2>
          {occurrence.evidenceRefs.length ? occurrence.evidenceRefs.map((evidence) => (
            <article className="sm-alarm-evidence" key={evidence.id}>
              <header><strong>{evidence.kind}</strong><span>{new Date(evidence.observedAt).toLocaleString()}</span></header>
              <p>{evidence.sourceIdentity ?? '—'} {evidence.sourcePointId ? '· ' + evidence.sourcePointId : ''}</p>
              <p>
                {evidence.metric ?? 'Evidence'}
                {evidence.value !== undefined ? ': ' + String(evidence.value) : ''}
                {evidence.unit ? ' ' + evidence.unit : ''}
              </p>
              {evidence.note ? <small>{evidence.note}</small> : null}
            </article>
          )) : <p>No evidence references recorded.</p>}
        </section>

        <section>
          <h2>Event timeline</h2>
          <ol className="sm-alarm-timeline">
            <li><strong>Alarm opened</strong><span>{new Date(occurrence.openedAt).toLocaleString()}</span></li>
            {transitions.map((transition) => (
              <li key={transition.id}>
                <strong>{transition.toState}</strong>
                <span>{new Date(transition.occurredAt).toLocaleString()}</span>
                <small>{transition.reason}</small>
              </li>
            ))}
            {occurrence.resolvedAt ? (
              <li><strong>Resolved</strong><span>{new Date(occurrence.resolvedAt).toLocaleString()}</span></li>
            ) : null}
          </ol>
        </section>
      </div>

      <footer className="sm-alarm-detail-meta">
        <span>Occurrence: {occurrence.id}</span>
        <span>Correlation: {occurrence.correlationKey}</span>
        <span>Rule: {occurrence.ruleVersion}</span>
      </footer>
      {error ? <p className="sm-alarm-unavailable">{error}</p> : null}
    </section>
  );
}
