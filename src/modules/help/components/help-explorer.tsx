'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  helpCategories,
  helpSummary,
  helpTitle,
  type HelpCategory,
  type HelpLocale,
} from '../catalog';
import type { IndexedHelpEntry } from '../server';

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function HelpExplorer({
  entries,
  locale,
}: {
  entries: IndexedHelpEntry[];
  locale: HelpLocale;
}) {
  const t = useTranslations('help');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<HelpCategory | 'all'>('all');
  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return entries.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      return words.every((word) => item.searchText.includes(word));
    });
  }, [category, entries, query]);

  return (
    <div className="help-explorer">
      <div className="help-search-wrap">
        <label htmlFor="help-search">{t('searchLabel')}</label>
        <div className="help-search-box">
          <span aria-hidden="true">⌕</span>
          <input
            id="help-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')}>
              {t('clear')}
            </button>
          )}
        </div>
        <p className="help-result-count" role="status">
          {t('resultCount', { count: results.length })}
        </p>
      </div>
      <div className="help-filters" role="group" aria-label={t('categories')}>
        <button
          type="button"
          className={category === 'all' ? 'is-active' : ''}
          aria-pressed={category === 'all'}
          onClick={() => setCategory('all')}
        >
          {t('all')}
        </button>
        {helpCategories.map((group) => (
          <button
            type="button"
            key={group.id}
            className={category === group.id ? 'is-active' : ''}
            aria-pressed={category === group.id}
            onClick={() => setCategory(group.id)}
          >
            {locale === 'es' ? group.es : group.en}
          </button>
        ))}
      </div>
      {results.length ? (
        <div className="help-card-grid">
          {results.map((item) => {
            const group = helpCategories.find((entry) => entry.id === item.category)!;
            return (
              <Link key={item.slug} className="help-article-card" href={'/help/' + item.slug}>
                <span className="help-card-category">{locale === 'es' ? group.es : group.en}</span>
                <h2>{helpTitle(item, locale)}</h2>
                <p>{helpSummary(item, locale)}</p>
                <span className="help-card-footer">
                  {t('estimated', { minutes: item.minutes })}
                  <b aria-hidden="true">↗</b>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="help-no-results" role="status">
          <h2>{t('emptyTitle')}</h2>
          <p>{t('emptyDescription')}</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setCategory('all');
            }}
          >
            {t('reset')}
          </button>
        </div>
      )}
    </div>
  );
}
