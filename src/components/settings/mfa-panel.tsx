'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface MfaState {
  enabled: boolean;
  pending: boolean;
  available: boolean;
}

export function MfaPanel() {
  const t = useTranslations('auth.mfa');
  const router = useRouter();
  const [state, setState] = useState<MfaState | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void fetch('/api/auth/mfa', { cache: 'no-store' })
      .then(async (response) => (response.ok ? ((await response.json()) as MfaState) : null))
      .then((data) => {
        if (mounted) setState(data);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function action(kind: 'start' | 'confirm' | 'disable') {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: kind,
          ...(kind !== 'confirm' ? { currentPassword: password } : {}),
          ...(kind !== 'start' ? { code } : {}),
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        secret?: string;
        uri?: string;
      };
      if (!response.ok) {
        setNotice(data.error ?? t('failed'));
      } else if (kind === 'start') {
        setSecret(data.secret ?? '');
        setUri(data.uri ?? '');
        setPassword('');
        setNotice(t('startInstructions'));
      } else {
        setCode('');
        setPassword('');
        setSecret('');
        setUri('');
        router.replace('/login');
        router.refresh();
      }
    } catch {
      setNotice(t('connectionError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t('title')}>
      <h3>{t('title')}</h3>
      {!state ? (
        <p>{t('loading')}</p>
      ) : !state.available ? (
        <p>{t('unavailable')}</p>
      ) : (
        <>
          <p>{state.enabled ? t('enabled') : t('disabled')}</p>
          {!state.enabled && !secret ? (
            <>
              <label>
                {t('currentPassword')}
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || !password}
                onClick={() => void action('start')}
              >
                {t('start')}
              </button>
            </>
          ) : null}
          {!state.enabled && secret ? (
            <>
              <p>{t('secretIntro')}</p>
              <code>{secret}</code>
              <p>{t('uri')}</p>
              <code>{uri}</code>
              <label>
                {t('code')}
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || code.length !== 6}
                onClick={() => void action('confirm')}
              >
                {t('confirm')}
              </button>
            </>
          ) : null}
          {state.enabled ? (
            <>
              <p>{t('disableIntro')}</p>
              <label>
                {t('currentPassword')}
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label>
                {t('code')}
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || !password || code.length !== 6}
                onClick={() => void action('disable')}
              >
                {t('disable')}
              </button>
            </>
          ) : null}
        </>
      )}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
