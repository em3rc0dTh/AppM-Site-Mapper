'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function UserCreateForm() {
  const t = useTranslations('forms.userCreate');
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
      setError(t('failed'));
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
        {t('name')}
        <input name="displayName" required />
      </label>
      <label>
        {t('email')}
        <input autoComplete="off" name="email" required type="email" />
      </label>
      <label>
        {t('role')}
        <select defaultValue="STANDARD" name="role">
          <option value="STANDARD">{t('standard')}</option>
          <option value="ADMIN">{t('admin')}</option>
          <option value="SUPERADMIN">{t('superadmin')}</option>
        </select>
      </label>
      <label>
        {t('temporaryPassword')}
        <input minLength={12} name="temporaryPassword" required type="password" />
      </label>
      <button disabled={busy} type="submit">
        {busy ? t('creating') : t('create')}
      </button>
      {error ? <small className="form-error">{error}</small> : null}
    </form>
  );
}
