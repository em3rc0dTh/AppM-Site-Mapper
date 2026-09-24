'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

function profileErrorMessage(error: string): string {
  const messages: Readonly<Record<string, string>> = {
    INVALID_INPUT: 'Display name is required and must be 120 characters or fewer.',
    SESSION_INVALID: 'Your session has expired. Sign in again.',
    USER_NOT_FOUND: 'Your user record is no longer available.',
    PROFILE_UPDATE_FAILED: 'Profile could not be saved. Try again.',
  };

  return messages[error] ?? error.replaceAll('_', ' ');
}

export function ProfileForm({ displayName }: Readonly<{ displayName: string }>) {
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
      setError(profileErrorMessage(body?.error ?? 'PROFILE_UPDATE_FAILED'));
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
        Display name
        <input defaultValue={displayName} maxLength={120} name="displayName" required />
        <small>Name shown to users in Site Mapper. It does not change the sign-in email.</small>
      </label>
      <button disabled={busy} type="submit">
        {busy ? 'Saving…' : 'Save profile'}
      </button>
      {saved ? <small className="settings-success">Saved.</small> : null}
      {error ? <small className="form-error">{error}</small> : null}
    </form>
  );
}
