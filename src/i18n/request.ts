import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, isSupportedLocale, localeCookieName } from './locales';

/** Locale is an explicit user preference, never derived from persisted inventory data. */
export default getRequestConfig(async () => {
  const candidate = (await cookies()).get(localeCookieName)?.value;
  const locale = isSupportedLocale(candidate) ? candidate : defaultLocale;

  return {
    locale,
    messages:
      locale === 'es'
        ? (await import('../messages/es.json')).default
        : (await import('../messages/en.json')).default,
    timeZone: 'America/Lima',
  };
});
