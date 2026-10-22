/** Supported catalog locales. English stays the sole active MK1 locale until launch of the full Spanish UI. */
export const locales = ['en', 'es'] as const;
export type SiteMapperLocale = (typeof locales)[number];
export const defaultLocale: SiteMapperLocale = 'en';
export function isSupportedLocale(value: unknown): value is SiteMapperLocale {
  return typeof value === 'string' && locales.some((locale) => locale === value);
}
