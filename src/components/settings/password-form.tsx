'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

function passwordErrorMessage(error: string): string {
  const messages: Readonly<Record<string, string>> = {
    PASSWORD_MINIMUM_12_CHARACTERS: 'New password must contain at least 12 characters.',
    INVALID_CURRENT_PASSWORD: 'Current password is incorrect.',
    PASSWORD_CHANGE_FAILED: 'Password could not be changed. Try again.',
  };

  return messages[error] ?? error.replaceAll('_', ' ');
}

export function PasswordForm() {
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
      setError('New password must contain at least 12 characters.');
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
      setError(passwordErrorMessage(body?.error ?? 'PASSWORD_CHANGE_FAILED'));
      setBusy(false);
      return;
    }

    router.replace('/login');
    router.refresh();
  }

  return (
    <form className="settings-form" onSubmit={submit}>
      <label>
        Current password
        <input autoComplete="current-password" name="currentPassword" required type="password" />
        <small>Used to verify that you are authorizing this security change.</small>
      </label>
      <label>
        New password
        <input
          autoComplete="new-password"
          minLength={12}
          name="newPassword"
          required
          type="password"
        />
        <small>Minimum 12 characters. Changing it signs out every active session.</small>
      </label>
      <button disabled={busy} type="submit">
        {busy ? 'Changing…' : 'Change password'}
      </button>
      <small>You will return to Sign in after the password is changed.</small>
      {error ? <small className="form-error">{error}</small> : null}
    </form>
  );
}
