import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import {
  getHelpEntry,
  helpCatalog,
  helpSummary,
  helpTitle,
  type HelpLocale,
} from '@/modules/help/catalog';
import { MarkdownHelpArticle } from '@/modules/help/components/markdown-article';
import { readHelpArticle } from '@/modules/help/server';
import { requirePermission } from '@/modules/identity/application/current-session';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getHelpEntry(slug);
  const locale: HelpLocale = (await getLocale()) === 'es' ? 'es' : 'en';
  return { title: entry ? helpTitle(entry, locale) + ' · Site Mapper Help' : 'Site Mapper Help' };
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');
  const { slug } = await params;
  const entry = getHelpEntry(slug);
  if (!entry) notFound();
  const [localeValue, t] = await Promise.all([getLocale(), getTranslations('help')]);
  const locale: HelpLocale = localeValue === 'es' ? 'es' : 'en';
  const content = await readHelpArticle(entry, locale);
  const index = helpCatalog.findIndex((article) => article.slug === slug);
  const before = helpCatalog[index - 1];
  const after = helpCatalog[index + 1];

  return (
    <main className="help-page help-article-layout">
      <aside className="help-article-sidebar">
        <Link className="help-back" href="/help">
          ← {t('back')}
        </Link>
        <strong>{t('contents')}</strong>
        <nav aria-label={t('manualNavigation')}>
          {helpCatalog.map((item) => (
            <Link
              href={'/help/' + item.slug}
              key={item.slug}
              aria-current={item.slug === slug ? 'page' : undefined}
            >
              {helpTitle(item, locale)}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="help-article-main">
        <nav className="help-breadcrumb" aria-label={t('breadcrumb')}>
          <Link href="/help">{t('home')}</Link>
          <span aria-hidden="true">/</span>
          <span>{helpTitle(entry, locale)}</span>
        </nav>
        <header className="help-article-header">
          <span className="help-eyebrow">
            {t('articleTag')} · {t('estimated', { minutes: entry.minutes })}
          </span>
          <h1>{helpTitle(entry, locale)}</h1>
          <p>{helpSummary(entry, locale)}</p>
        </header>
        <MarkdownHelpArticle text={content} locale={locale} />
        <nav className="help-next" aria-label={t('adjacent')}>
          {before ? (
            <Link href={'/help/' + before.slug}>
              <span>← {t('previous')}</span>
              <strong>{helpTitle(before, locale)}</strong>
            </Link>
          ) : (
            <span />
          )}
          {after ? (
            <Link href={'/help/' + after.slug}>
              <span>{t('next')} →</span>
              <strong>{helpTitle(after, locale)}</strong>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </main>
  );
}
