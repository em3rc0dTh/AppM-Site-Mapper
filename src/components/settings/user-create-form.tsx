'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function UserCreateForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/settings/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: String(form.get('email') ?? ''),
        displayName: String(form.get('displayName') ?? ''),
        role: String(form.get('role') ?? 'STANDARD'),
        temporaryPassword: String(form.get('temporaryPassword') ?? ''),
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(body?.error ?? 'USER_CREATE_FAILED');
      setBusy(false);
      return;
    }

    event.currentTarget.reset();
    setBusy(false);
    router.refresh();
  }

  return (
    <form className="settings-form settings-user-create" onSubmit={submit}>
      <label>
        Name
        <input name="displayName" required />
        <small>Display name shown inside Site Mapper.</small>
      </label>
      <label>
        Email
        <input autoComplete="off" name="email" required type="email" />
        <small>Sign-in identity for this user.</small>
      </label>
      <label>
        Role
        <select defaultValue="STANDARD" name="role">
          <option value="STANDARD">Standard</option>
          <option value="ADMIN">Admin</option>
          <option value="SUPERADMIN">Superadmin</option>
        </select>
        <small>
          Standard: read topology/power/telemetry. Admin: edit topology, power and settings.
          Superadmin: also manage users and protected system actions.
        </small>
      </label>
      <label>
        Temporary password
        <input minLength={12} name="temporaryPassword" required type="password" />
        <small>Minimum 12 characters. The user signs in with this initial password.</small>
      </label>
      <button disabled={busy} type="submit">
        {busy ? 'Creating…' : 'Create user'}
      </button>
      {error ? <small className="form-error">{error}</small> : null}
    </form>
  );
}
