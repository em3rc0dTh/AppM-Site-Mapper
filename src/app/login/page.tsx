'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { isWorkspaceHref } from '@/modules/workspace/domain/context';
import { AuthFrame } from '@/shared/ui/auth-frame';
import { useHydrated } from '@/shared/ui/use-hydrated';

interface LoginResponse {
  readonly error?: string;
  readonly user?: {
    readonly mustChangePassword?: boolean;
  };
}

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();

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
          mfaCode: String(form.get('mfaCode') ?? ''),
        }),
      });
      const result = (await response.json()) as LoginResponse;

      if (!response.ok) {
        setError(
          result.error === 'INVALID_CREDENTIALS'
            ? t('credentialsError')
            : result.error === 'MFA_REQUIRED' || result.error === 'MFA_INVALID'
              ? t('mfaNeeded')
              : result.error === 'MFA_ENROLLMENT_REQUIRED'
                ? t('mfaEnrollmentRequired')
                : t('loginError'),
        );
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
      setError(t('connectionError'));
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      eyebrow={t('eyebrow')}
      title={t('title')}
      description={t('description')}
      showProviderBrand
      heritageBrand
    >
      <form className="auth-form" onSubmit={submit}>
        <label>
          <span>{t('email')}</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            placeholder="operator@company.com"
            required
          />
        </label>
        <label>
          <span>{t('password')}</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            required
          />
        </label>
        <label>
          <span>{t('mfaCode')}</span>
          <input
            name="mfaCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
          />
        </label>
        <button className="auth-submit" type="submit" disabled={!hydrated || busy}>
          {busy ? t('submitting') : t('submit')}
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
