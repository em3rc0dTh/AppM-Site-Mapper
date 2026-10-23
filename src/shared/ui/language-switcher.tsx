'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { isSupportedLocale, localeCookieName } from '@/i18n/locales';

/** Explicit per-browser preference. Does not mutate user-entered data or URL paths. */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('language');
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
          // Reload the current URL so the server renders the root HTML language
          // consistently with the newly validated locale cookie.
          window.location.reload();
        }}
      >
        <option value="en">English</option>
        <option value="es">Español</option>
      </select>
    </label>
  );
}
