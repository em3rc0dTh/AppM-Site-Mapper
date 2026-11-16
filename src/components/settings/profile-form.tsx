'use client';

import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function ProfileForm({ displayName }: Readonly<{ displayName: string }>) {
  const t = useTranslations('forms.profile');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/settings/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: String(form.get('displayName') ?? '') }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(t('failed'));
      setBusy(false);
      return;
    }

    setSaved(true);
    setBusy(false);
    router.refresh();
  }

  return (
    <form className="settings-form" onSubmit={submit}>
      <label>
        {t('displayName')}
        <input defaultValue={displayName} maxLength={120} name="displayName" required />
      </label>
      <button disabled={busy} type="submit">
        {busy ? t('saving') : t('save')}
      </button>
      {saved ? <small className="settings-success">{t('saved')}</small> : null}
      {error ? <small className="form-error">{error}</small> : null}
    </form>
  );
}
