'use client';

import { useState, type FormEvent } from 'react';

interface LoginResponse {
  readonly error?: string;
  readonly user?: {
    readonly mustChangePassword?: boolean;
  };
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      }),
    });
    const result = (await response.json()) as LoginResponse;

    if (!response.ok) {
      setError(result.error ?? 'LOGIN_FAILED');
      setBusy(false);
      return;
    }

    window.location.href = result.user?.mustChangePassword ? '/change-password' : '/workspace';
  }

  return (
    <main className="shell">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">AppManager · Site Mapper</p>
        <h1>Sign in</h1>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {error ? <p className="form-error">{error}</p> : null}
      </form>
    </main>
  );
}
