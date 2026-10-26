import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { HelpExplorer } from '@/modules/help/components/help-explorer';
import { getHelpSearchIndex } from '@/modules/help/server';
import { requirePermission } from '@/modules/identity/application/current-session';

export const dynamic = 'force-dynamic';

export default async function HelpCenterPage() {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');
  const [localeValue, t, entries] = await Promise.all([
    getLocale(), getTranslations('help'), getHelpSearchIndex(),
  ]);
  const locale = localeValue === 'es' ? 'es' as const : 'en' as const;

  return (
    <main className="help-page">
      <nav className="help-breadcrumb" aria-label={t('breadcrumb')}><span>{t('home')}</span></nav>
      <header className="help-hero">
        <span className="help-eyebrow">SITE MAPPER MK1 · {t('documentation')}</span>
        <h1>{t('heroTitle')}</h1>
        <p>{t('heroDescription')}</p>
        {locale === 'en' && <p className="help-language-note">{t('spanishNote')}</p>}
      </header>
      <HelpExplorer entries={entries} locale={locale} />
      <footer className="help-footer-note">{t('safetyReminder')}</footer>
    </main>
  );
}
