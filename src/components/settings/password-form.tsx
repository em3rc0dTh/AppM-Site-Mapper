'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function PasswordForm() {
  const t = useTranslations('forms.password');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');

    if (newPassword.length < 12) {
      setError(t('minLength'));
      setBusy(false);
      return;
    }

    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(t('failed'));
      setBusy(false);
      return;
    }

    router.replace('/login');
    router.refresh();
  }

  return (
    <form className="settings-form" onSubmit={submit}>
      <label>
        {t('current')}
        <input autoComplete="current-password" name="currentPassword" required type="password" />
      </label>
      <label>
        {t('next')}
        <input
          autoComplete="new-password"
          minLength={12}
          name="newPassword"
          required
          type="password"
        />
      </label>
      <button disabled={busy} type="submit">
        {busy ? t('changing') : t('submit')}
      </button>
      <small>{t('help')}</small>
      {error ? <small className="form-error">{error}</small> : null}
    </form>
  );
}
