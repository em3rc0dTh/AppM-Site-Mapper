import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import {
  getHelpEntry,
  getHelpJourneyForArticle,
  helpCatalog,
  helpCategories,
  helpEditorGuides,
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
  const sequence = getHelpJourneyForArticle(slug);
  const before = sequence
    ? getHelpEntry(sequence.journey.slugs[sequence.index - 1] ?? '')
    : helpCatalog[index - 1];
  const after = sequence
    ? getHelpEntry(sequence.journey.slugs[sequence.index + 1] ?? '')
    : helpCatalog[index + 1];

  return (
    <main className="help-page help-article-layout">
      <aside className="help-article-sidebar">
        <Link className="help-back" href="/help">
          ← {t('back')}
        </Link>
        <strong>{t('contents')}</strong>
        <nav aria-label={t('manualNavigation')}>
          {helpCategories.map((group) => {
            const items = helpCatalog.filter((item) => item.category === group.id);
            return (
              <details key={group.id} open={entry.category === group.id}>
                <summary>{locale === 'es' ? group.es : group.en}</summary>
                <div className="help-sidebar-chapters">
                  {items.map((item) => (
                    <Link key={item.slug} href={'/help/' + item.slug}
                      aria-current={item.slug === slug ? 'page' : undefined}>
                      {helpTitle(item, locale)}
                    </Link>
                  ))}
                </div>
              </details>
            );
          })}
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
          {helpEditorGuides.includes(entry.slug) && (
            <small className="help-editor-note">{t('editorOnly')}</small>
          )}
          <p>{helpSummary(entry, locale)}</p>
        </header>
        {sequence && (
          <nav className="help-task-steps" aria-label={t('journeyLabel')}>
            <div className="help-task-steps-heading">
              <strong>{locale === 'es' ? sequence.journey.title : sequence.journey.enTitle}</strong>
              <span>{t('journeyProgress', { index: sequence.index + 1, count: sequence.journey.slugs.length })}</span>
            </div>
            <ol>
              {sequence.journey.slugs.map((stepSlug, stepIndex) => {
                const item = getHelpEntry(stepSlug);
                if (!item) return null;
                return (
                  <li key={stepSlug} aria-current={stepSlug === slug ? 'step' : undefined}>
                    <Link href={'/help/' + stepSlug}>
                      <span aria-hidden="true">{stepIndex + 1}</span>
                      <span>{helpTitle(item, locale)}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
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
