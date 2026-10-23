/** Explicit user-facing locale preference. Technical domain values remain unchanged. */
export const locales = ['en', 'es'] as const;
export type SiteMapperLocale = (typeof locales)[number];
export const defaultLocale: SiteMapperLocale = 'en';
export const localeCookieName = 'site_mapper_locale';

export function isSupportedLocale(value: unknown): value is SiteMapperLocale {
  return typeof value === 'string' && locales.some((locale) => locale === value);
}
