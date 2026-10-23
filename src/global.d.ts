import en from '@/messages/en.json';
import type { SiteMapperLocale } from '@/i18n/locales';

declare module 'next-intl' {
  interface AppConfig {
    Locale: SiteMapperLocale;
    Messages: typeof en;
  }
}
