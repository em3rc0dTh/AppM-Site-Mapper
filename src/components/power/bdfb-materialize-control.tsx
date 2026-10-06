'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function BdfbMaterializeControl({ deviceId }: Readonly<{ deviceId: string }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function materialize() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/bdfb/${encodeURIComponent(deviceId)}/materialize`, {
        method: 'POST',
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'BDFB_MATERIALIZATION_FAILED');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'BDFB_MATERIALIZATION_FAILED');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="zip-bdfb-materialize-control">
      <button type="button" disabled={busy} onClick={() => void materialize()}>
        {busy ? 'MATERIALIZING…' : 'MATERIALIZE CANONICAL BDFB'}
      </button>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
