'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { isSupportedLocale, localeCookieName } from '@/i18n/locales';

/** Explicit per-browser preference. Does not mutate user-entered data or URL paths. */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('language');
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <label className="sm-locale-control">
      <span className="sr-only">{t('selection')}</span>
      <select
        aria-label={t('selection')}
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const selected = event.target.value;
          if (!isSupportedLocale(selected) || selected === locale) return;
          setPending(true);
          const secure = window.location.protocol === 'https:' ? '; Secure' : '';
          document.cookie = `${localeCookieName}=${selected}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
          router.refresh();
          setPending(false);
        }}
      >
        <option value="en">English</option>
        <option value="es">Español</option>
      </select>
    </label>
  );
}
