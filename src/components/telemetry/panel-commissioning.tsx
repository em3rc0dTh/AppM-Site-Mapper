'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface Row {
  position: number;
  breakerId: string;
  breakerName: string;
  point: string;
  existingMetrics: string[];
  conflicts: string[];
  conflictingOwnSources: { id: string; source: string }[];
  ready: boolean;
}
interface Preview {
  panelId: string;
  sourceIdentity: string;
  pointPrefix: string;
  capacity: number;
  rows: Row[];
}

export function PanelCommissioning({ panelId, canWrite }: { panelId: string; canWrite: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const t = useTranslations('panelCommissioning');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const router = useRouter();

  async function refresh() {
    try {
      const response = await fetch(
        '/api/telemetry/panel-commissioning?' + new URLSearchParams({ panelId }),
        { cache: 'no-store' },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'COMMISSIONING_UNAVAILABLE');
      setPreview(body as Preview);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'COMMISSIONING_UNAVAILABLE');
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/telemetry/panel-commissioning?' + new URLSearchParams({ panelId }), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'COMMISSIONING_UNAVAILABLE');
        if (!controller.signal.aborted) setPreview(body as Preview);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'COMMISSIONING_UNAVAILABLE');
      });
    return () => controller.abort();
  }, [panelId]);

  async function retireSource(row: Row, binding: { id: string; source: string }) {
    if (!preview || !canWrite || confirm !== row.breakerId) return;
    setBusy(row.breakerId);
    try {
      const response = await fetch('/api/telemetry/panel-commissioning', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'retire-own-source',
          panelId,
          breakerId: row.breakerId,
          confirmPoint: true,
          confirmSource: preview.sourceIdentity,
          confirmRawPoint: row.point,
          bindingId: binding.id,
          retiredSource: binding.source,
          confirmRetirement: true,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'SOURCE_RETIREMENT_FAILED');
      setConfirm(null);
      await refresh();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SOURCE_RETIREMENT_FAILED');
    } finally {
      setBusy(null);
    }
  }

  async function commission(row: Row) {
    if (!preview || !canWrite || confirm !== row.breakerId) return;
    setBusy(row.breakerId);
    setError('');
    try {
      const response = await fetch('/api/telemetry/panel-commissioning', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          panelId,
          breakerId: row.breakerId,
          confirmPoint: true,
          confirmSource: preview.sourceIdentity,
          confirmRawPoint: row.point,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error([result.error, ...(result.conflicts ?? [])].join(': '));
      setConfirm(null);
      await refresh();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'COMMISSION_FAILED');
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="equipment-panel-commissioning" aria-label={t('panelCommissioning')}>
      <h3>{t('title')}</h3>
      {preview ? (
        <>
          <p>
            {t('sourceSummary', { source: preview.sourceIdentity, prefix: preview.pointPrefix, capacity: preview.capacity })}
          </p>
          <small>
            {t('safetyNote')}
          </small>
          {preview.rows.map((row) => (
            <div key={row.breakerId} style={{ borderTop: '1px solid #c6c9bd', padding: '10px 0' }}>
              <strong>
                {t('positionLabel', { position: row.position, name: row.breakerName })}
              </strong>
              <p>
                {row.point} · {t('bindings', { count: row.existingMetrics.length })}{' '}
                {row.ready ? t('verifiedMapping') : ''}
              </p>
              {row.conflicts.length ? (
                <div>
                  <p role="alert">
                    {t('conflictWarning', { conflicts: row.conflicts.join('; ') })}
                  </p>
                  {canWrite && row.conflictingOwnSources.length > 0 && (
                    <>
                      <label>
                        <input
                          type="checkbox"
                          checked={confirm === row.breakerId}
                          onChange={(event) =>
                            setConfirm(event.target.checked ? row.breakerId : null)
                          }
                        />
                        {t('retireConfirm')}
                      </label>
                      {row.conflictingOwnSources.map((binding) => (
                        <button
                          type="button"
                          key={binding.id}
                          disabled={confirm !== row.breakerId || busy !== null}
                          onClick={() => void retireSource(row, binding)}
                        >
                          {t('retireSource', { source: binding.source })}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              ) : !row.ready && canWrite ? (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirm === row.breakerId}
                      onChange={(event) => setConfirm(event.target.checked ? row.breakerId : null)}
                    />
                    {t('physicalVerify', { source: preview.sourceIdentity, point: row.point })}
                  </label>
                  <button
                    type="button"
                    disabled={confirm !== row.breakerId || busy !== null}
                    onClick={() => void commission(row)}
                  >
                    {t('confirmPoint')}
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </>
      ) : (
        <p>{t('loading')}</p>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy !== null} onClick={() => void refresh()}>
        {t('refreshCommission')}
      </button>
    </section>
  );
}
