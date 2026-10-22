import { getRequestConfig } from 'next-intl/server';

import { defaultLocale } from './locales';

/**
 * English-only runtime for the current release.
 *
 * Future opt-in multilingual launch: resolve an authenticated, validated
 * locale and load messages from the catalog in that same request. Do not
 * infer language from user-entered Equipment, Site or Device names.
 *
 * No locale-based URL routing and no middleware/proxy are added here.
 */
export default getRequestConfig(async () => ({
  locale: defaultLocale,
  messages: (await import('../messages/en.json')).default,
}));
