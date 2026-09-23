'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DemoSeedButton() {
  const router = useRouter();
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
      setError('Could not load the development demo topology.');
      setBusy(false);
    }
  }

  return (
    <div className="demo-seed-action">
      <button type="button" className="button-quiet" disabled={busy} onClick={seed}>
        {busy ? 'Loading demo topology…' : 'Load demo topology'}
      </button>
      <span>Development only · memory persistence</span>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
