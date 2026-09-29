'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { isWorkspaceHref } from '@/modules/workspace/domain/context';
import { AuthFrame } from '@/shared/ui/auth-frame';

interface LoginResponse {
  readonly error?: string;
  readonly user?: {
    readonly mustChangePassword?: boolean;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
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

      if (result.user?.mustChangePassword) {
        router.replace('/change-password');
        return;
      }

      const contextResponse = await fetch('/api/workspace/context');
      const context = contextResponse.ok
        ? ((await contextResponse.json()) as { lastContext?: string })
        : {};

      router.replace(isWorkspaceHref(context.lastContext) ? context.lastContext : '/workspace');
      router.refresh();
    } catch {
      setError('Connection unavailable. Please try again.');
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      eyebrow="Identity / secure access"
      title="Sign in"
      description="Authenticate to enter the Site Mapper operational workspace."
    >
      <form className="auth-form" onSubmit={submit}>
        <label>
          <span>Email</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            placeholder="operator@company.com"
            required
          />
        </label>
        <label>
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            required
          />
        </label>
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? 'Establishing secure session…' : 'SIGN IN'}
        </button>
        {error ? (
          <p className="form-error auth-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </AuthFrame>
  );
}