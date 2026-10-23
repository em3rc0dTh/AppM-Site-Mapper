'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function DemoSeedButton() {
  const router = useRouter();
  const t = useTranslations('demoSeed');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function seed() {
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/dev/seed-demo', { method: 'POST' });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'SEED_FAILED');
      }

      router.refresh();
    } catch {
      setError(t('failed'));
      setBusy(false);
    }
  }

  return (
    <div className="demo-seed-action">
      <button type="button" className="button-quiet" disabled={busy} onClick={seed}>
        {busy ? t('loading') : t('load')}
      </button>
      <span>{t('developmentOnly')}</span>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
