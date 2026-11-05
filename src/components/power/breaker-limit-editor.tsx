'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  BreakerProtection,
  BreakerRatingSource,
} from '@/modules/power/domain/breaker-protection';

interface LimitsView {
  breakerId: string;
  breakerName: string;
  panelName: string;
  revision: number;
  protection: BreakerProtection | null;
  policy: { assertAboveA: number; clearBelowA: number } | null;
  canEdit: boolean;
  policyEnabled: boolean | null;
}
interface Event {
  id: string;
  actorId: string;
  occurredAt: string;
  before: BreakerProtection | null;
  after: BreakerProtection;
  beforePolicy: { assertAboveA: number; clearBelowA: number } | null;
  afterPolicy: { assertAboveA: number; clearBelowA: number };
}
const sourceOptions: readonly BreakerRatingSource[] = [
  'PROVISIONAL_STANDARD',
  'FIELD_SURVEY',
  'MANUFACTURER',
  'CUSTOMER_DOCUMENT',
];

export function BreakerLimitEditor({
  breakerId,
  view,
  x,
  y,
  onClose,
}: Readonly<{
  breakerId: string;
  view: 'limits' | 'history';
  x: number;
  y: number;
  onClose: () => void;
}>) {
  const t = useTranslations('breakerLimits');
  const [data, setData] = useState<LimitsView | null>(null);
  const [history, setHistory] = useState<readonly Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState('');
  const [assertAt, setAssertAt] = useState('');
  const [clearAt, setClearAt] = useState('');
  const [source, setSource] = useState<BreakerRatingSource>('PROVISIONAL_STANDARD');
  const [reference, setReference] = useState('');
  const [verified, setVerified] = useState(false);
  const [confirmEvidence, setConfirmEvidence] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const prefix = `/api/power/breakers/${encodeURIComponent(breakerId)}/limits`;

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => previousFocus?.focus();
  }, []);

  function handleDialogKey(event: import('react').KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ) ?? []),
    ].filter((item) => item.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === titleRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    let cancelled = false;
    titleRef.current?.focus();
    void Promise.all([
      fetch(prefix, { cache: 'no-store' }).then(async (r) => {
        const payload = await r.json();
        if (!r.ok) throw new Error(payload.error ?? 'READ_FAILED');
        return payload as LimitsView;
      }),
      fetch(prefix + '/history', { cache: 'no-store' }).then(async (r) => {
        if (!r.ok) return { history: [] as Event[] };
        return r.json() as Promise<{ history: Event[] }>;
      }),
    ])
      .then(([view, audit]) => {
        if (cancelled) return;
        setData(view);
        setHistory(audit.history ?? []);
        setRating(String(view.protection?.ratedCurrentA ?? ''));
        setAssertAt(String(view.protection?.assertAboveA ?? view.policy?.assertAboveA ?? ''));
        setClearAt(String(view.protection?.clearBelowA ?? view.policy?.clearBelowA ?? ''));
        setSource(view.protection?.provenance.source ?? 'PROVISIONAL_STANDARD');
        setReference(view.protection?.provenance.reference ?? '');
        setVerified(view.protection?.provenance.verified ?? false);
        setConfirmEvidence(false);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'READ_FAILED');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [prefix]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.canEdit || saving) return;
    if (source !== 'PROVISIONAL_STANDARD' && (!reference.trim() || !confirmEvidence)) {
      setError(t('confirmError'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(prefix, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ratedCurrentA: Number(rating),
          assertAboveA: Number(assertAt),
          clearBelowA: Number(clearAt),
          provenance: {
            source,
            verified,
            ...(reference.trim() ? { reference: reference.trim() } : {}),
          },
          expectedRevision: data.revision,
          verificationConfirmed: source !== 'PROVISIONAL_STANDARD' && confirmEvidence,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'SAVE_FAILED');
      setData({ ...payload, canEdit: data.canEdit } as LimitsView);
      const audit = await fetch(prefix + '/history', { cache: 'no-store' });
      if (audit.ok) setHistory(((await audit.json()) as { history: Event[] }).history);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'SAVE_FAILED');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="sm-breaker-limit-popover-layer"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="sm-breaker-limit-dialog"
        role="dialog"
        aria-modal="false"
        aria-label={view === 'history' ? t('history') : t('title')}
        data-view={view}
        style={{ left: x, top: y }}
        onKeyDown={handleDialogKey}
      >
        <header className="sm-breaker-limit-header">
          <div>
            <h2 ref={titleRef} tabIndex={-1}>
              {view === 'history' ? t('history') : t('title')}
            </h2>
            <small>{data ? `${data.panelName} · ${data.breakerName}` : breakerId}</small>
          </div>
          <button type="button" onClick={onClose} aria-label={t('close')}>
            ✕
          </button>
        </header>
        {loading ? (
          <p>{t('loading')}</p>
        ) : error && !data ? (
          <p role="alert">{error}</p>
        ) : data ? (
          <>
            {view === 'limits' ? (
              <>
                <p className="sm-breaker-limit-note">{t('note')}</p>
                {data.policyEnabled === false ? (
                <p role="status">{t('disabled')}</p>
                ) : data.policyEnabled === null ? (
                <p role="status">{t('commission')}</p>
                ) : null}
                <form onSubmit={save} className="sm-breaker-limit-form">
                <label>
                {t('rating')}
                <input
                type="number"
                min="0.001"
                max="100000"
                step="any"
                required
                value={rating}
                disabled={!data.canEdit || saving}
                onChange={(e) => setRating(e.target.value)}
                />
                </label>
                <label>
                {t('assert')}
                <input
                type="number"
                min="0.001"
                max="100000"
                step="any"
                required
                value={assertAt}
                disabled={!data.canEdit || saving}
                onChange={(e) => setAssertAt(e.target.value)}
                />
                </label>
                <label>
                {t('clear')}
                <input
                type="number"
                min="0.001"
                max="100000"
                step="any"
                required
                value={clearAt}
                disabled={!data.canEdit || saving}
                onChange={(e) => setClearAt(e.target.value)}
                />
                </label>
                <label>
                {t('provenance')}
                <select
                value={source}
                disabled={!data.canEdit || saving}
                onChange={(e) => {
                const v = e.target.value as BreakerRatingSource;
                setSource(v);
                setVerified(v !== 'PROVISIONAL_STANDARD');
                setConfirmEvidence(false);
                }}
                >
                {sourceOptions.map((v) => (
                <option key={v} value={v}>
                {t(`sources.${v}`)}
                </option>
                ))}
                </select>
                </label>
                {source !== 'PROVISIONAL_STANDARD' ? (
                <>
                <label>
                {t('reference')}
                <input
                type="text"
                maxLength={320}
                value={reference}
                required
                disabled={!data.canEdit || saving}
                onChange={(e) => setReference(e.target.value)}
                />
                </label>
                <label className="sm-breaker-confirm-evidence">
                <input
                type="checkbox"
                checked={confirmEvidence}
                disabled={!data.canEdit || saving}
                onChange={(e) => setConfirmEvidence(e.target.checked)}
                />
                {t('confirm')}
                </label>
                </>
                ) : (
                <p className="sm-breaker-limit-note">{t('provisional')}</p>
                )}
                <p className="sm-breaker-limit-note">{t('hysteresis')}</p>
                {error ? <p role="alert">{error}</p> : null}
                {data.canEdit ? (
                <button type="submit" disabled={saving || !rating || !assertAt || !clearAt}>
                {saving ? t('saving') : t('save')}
                </button>
                ) : (
                <p>{t('readOnly')}</p>
                )}
                </form>
              </>
            ) : (
              <section className="sm-breaker-limit-audit" aria-label={t('historyLabel')}>
              <h3>{t('history')}</h3>
              {history.length ? (
              <ul>
              {history.map((entry) => (
              <li key={entry.id}>
              <time dateTime={entry.occurredAt}>{entry.occurredAt}</time> · {entry.actorId}
              <div>
              {t('ratingChange', {
              before: entry.before?.ratedCurrentA ?? t('unset'),
              after: entry.after.ratedCurrentA,
              })}
              </div>
              <div>
              {t('assertChange', {
              before:
              entry.beforePolicy?.assertAboveA ??
              entry.before?.assertAboveA ??
              t('unset'),
              after: entry.after.assertAboveA,
              })}
              </div>
              <div>
              {t('clearChange', {
              before:
              entry.beforePolicy?.clearBelowA ??
              entry.before?.clearBelowA ??
              t('unset'),
              after: entry.after.clearBelowA,
              })}
              </div>
              </li>
              ))}
              </ul>
              ) : (
              <p>{t('empty')}</p>
              )}
              </section>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
