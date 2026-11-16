'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function PinButton({ id, initialPinned }: Readonly<{ id: string; initialPinned: boolean }>) {
  const t = useTranslations('pins');
  const [pinned, setPinned] = useState(initialPinned);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);

    const response = await fetch(`/api/inventory/${id}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !pinned }),
    });

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      setError(
        body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? t('saveError')
          : t('saveError'),
      );
      setPending(false);
      return;
    }

    setPinned(!pinned);
    setPending(false);
  }

  return (
    <div className="pin-control">
      <button disabled={pending} onClick={toggle} type="button">
        {pinned ? t('unpin') : t('pin')}
      </button>
      {error ? <small className="form-error">{error}</small> : null}
    </div>
  );
}
