'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function PasswordForm({
  presentation = 'settings',
  forced = false,
}: Readonly<{
  presentation?: 'settings' | 'auth';
  forced?: boolean;
}>) {
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
    const confirmPassword = String(form.get('confirmPassword') ?? '');

    if (newPassword.length < 12) {
      setError(t('minLength'));
      setBusy(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('mismatch'));
      setBusy(false);
      return;
    }

    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!response.ok) {
      setError(t('failed'));
      setBusy(false);
      return;
    }

    router.replace('/login');
    router.refresh();
  }

  const authPresentation = presentation === 'auth';

  return (
    <form
      className={authPresentation ? 'auth-form auth-password-form' : 'settings-form'}
      onSubmit={submit}
    >
      <label>
        <span>{forced ? t('temporary') : t('current')}</span>
        <input autoComplete="current-password" name="currentPassword" required type="password" />
      </label>

      <label>
        <span>{t('next')}</span>
        <input
          autoComplete="new-password"
          minLength={12}
          name="newPassword"
          required
          type="password"
        />
      </label>

      <label>
        <span>{t('confirm')}</span>
        <input
          autoComplete="new-password"
          minLength={12}
          name="confirmPassword"
          required
          type="password"
        />
      </label>

      <button
        className={authPresentation ? 'auth-submit' : undefined}
        disabled={busy}
        type="submit"
      >
        {busy ? t('changing') : forced ? t('setPassword') : t('submit')}
      </button>

      <small className={authPresentation ? 'auth-password-help' : undefined}>
        {forced ? t('forcedHelp') : t('help')}
      </small>

      {error ? <small className="form-error auth-error">{error}</small> : null}
    </form>
  );
}
