'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

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
      setError('PASSWORD_MINIMUM_12_CHARACTERS');
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
      setError(body?.error ?? 'PASSWORD_CHANGE_FAILED');
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
      </label>
      <button disabled={busy} type="submit">
        {busy ? 'Changing…' : 'Change password'}
      </button>
      <small>Changing your password revokes every active session, including this one.</small>
      {error ? <small className="form-error">{error}</small> : null}
    </form>
  );
}
