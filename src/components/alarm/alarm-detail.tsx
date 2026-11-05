'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { compactAlarmPath } from '@/components/alarm/alarm-path';
import { useCallback, useEffect, useState } from 'react';

import type { AlarmOccurrenceView, AlarmTransition } from '@/modules/alarm/domain/entities';

export function AlarmDetail({ id, canAck }: { readonly id: string; readonly canAck: boolean }) {
  const t = useTranslations('alarmUi.detail');
  const [occurrence, setOccurrence] = useState<AlarmOccurrenceView | null>(null);
  const [transitions, setTransitions] = useState<readonly AlarmTransition[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/alarms/' + encodeURIComponent(id), { cache: 'no-store' });
    if (!response.ok) throw new Error('ALARM_NOT_FOUND');
    const payload = (await response.json()) as {
      occurrence: AlarmOccurrenceView;
      transitions: readonly AlarmTransition[];
    };
    setOccurrence(payload.occurrence);
    setTransitions(payload.transitions);
  }, [id]);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void load().catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'LOAD_FAILED'),
      );
    }, 0);
    return () => window.clearTimeout(initial);
  }, [load]);

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
  if (!occurrence) return <div className="sm-alarm-detail">{t('loading')}</div>;

  return (
    <section className="sm-alarm-detail" data-severity={occurrence.severity}>
      <header className="sm-alarm-detail-hero">
        <div>
          <span>{occurrence.family}</span>
          <h1>{occurrence.name}</h1>
          <p>
            {occurrence.severity} · {occurrence.lifecycle} · {occurrence.confidence ?? '—'} ·{' '}
            {occurrence.acknowledgement}
          </p>
        </div>
        <div>
          {canAck && occurrence.acknowledgement === 'UNACKNOWLEDGED' ? (
            <button type="button" disabled={busy} onClick={() => void acknowledge()}>
              {busy ? t('acknowledging') : t('acknowledge')}
            </button>
          ) : null}
          <Link href={occurrence.targetHref}>{t('goToTarget')}</Link>
        </div>
      </header>

      <section className="sm-alarm-detail-path">
        <small>{t('target')}</small>
        <div>
          {compactAlarmPath(occurrence.path).map((item, index) => (
            <span key={item.id}>
              {index > 0 ? ' › ' : ''}
              <Link href={item.href}>{item.name}</Link>
            </span>
          ))}
        </div>
      </section>

      <div className="sm-alarm-detail-grid">
        <section>
          <h2>{t('evidence')}</h2>
          {occurrence.evidenceRefs.length ? (
            occurrence.evidenceRefs.map((evidence) => (
              <article className="sm-alarm-evidence" key={evidence.id}>
                <header>
                  <strong>{evidence.kind}</strong>
                  <span>{new Date(evidence.observedAt).toLocaleString()}</span>
                </header>
                <p>
                  {evidence.sourceIdentity ?? '—'}{' '}
                  {evidence.sourcePointId ? '· ' + evidence.sourcePointId : ''}
                </p>
                <p>
                  {evidence.metric ?? t('evidenceFallback')}
                  {evidence.value !== undefined ? ': ' + String(evidence.value) : ''}
                  {evidence.unit ? ' ' + evidence.unit : ''}
                </p>
                {evidence.assertThreshold !== undefined ? (
                  <p>
                    {t('triggerThreshold')}: {evidence.assertThreshold}{' '}
                    {evidence.thresholdUnit ?? evidence.unit ?? ''}
                  </p>
                ) : null}
                {evidence.clearThreshold !== undefined ? (
                  <p>
                    {t('clearThreshold')}: {evidence.clearThreshold}{' '}
                    {evidence.thresholdUnit ?? evidence.unit ?? ''}
                  </p>
                ) : null}
                {evidence.policyId ? (
                  <small>
                    {t('policy')}: {evidence.policyId}
                  </small>
                ) : null}
                {evidence.note ? <small>{evidence.note}</small> : null}
              </article>
            ))
          ) : (
            <p>{t('noEvidence')}</p>
          )}
        </section>

        <section>
          <h2>{t('timeline')}</h2>
          <ol className="sm-alarm-timeline">
            <li>
              <strong>{t('opened')}</strong>
              <span>{new Date(occurrence.openedAt).toLocaleString()}</span>
            </li>
            {transitions.map((transition) => (
              <li key={transition.id}>
                <strong>{transition.toState}</strong>
                <span>{new Date(transition.occurredAt).toLocaleString()}</span>
                <small>{transition.reason}</small>
              </li>
            ))}
            {occurrence.resolvedAt ? (
              <li>
                <strong>{t('resolved')}</strong>
                <span>{new Date(occurrence.resolvedAt).toLocaleString()}</span>
              </li>
            ) : null}
          </ol>
        </section>
      </div>

      <footer className="sm-alarm-detail-meta">
        <span>
          {t('occurrence')}: {occurrence.id}
        </span>
        <span>
          {t('correlation')}: {occurrence.correlationKey}
        </span>
        <span>
          {t('rule')}: {occurrence.ruleVersion}
        </span>
      </footer>
      {error ? <p className="sm-alarm-unavailable">{error}</p> : null}
    </section>
  );
}
