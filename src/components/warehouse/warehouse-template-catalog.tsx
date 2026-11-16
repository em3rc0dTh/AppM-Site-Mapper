'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { AssetTemplate } from '@/modules/warehouse/domain/template';

function normalized(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase();
}

function matches(template: AssetTemplate, query: string): boolean {
  if (!query) return true;

  return [template.name, template.category, template.manufacturer, template.model, template.notes]
    .map(normalized)
    .some((value) => value.includes(query));
}

export function WarehouseTemplateCatalog({
  templates,
}: Readonly<{ templates: readonly AssetTemplate[] }>) {
  const t = useTranslations('warehouseForms');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  const categories = useMemo(
    () =>
      [
        ...new Set(templates.flatMap((template) => (template.category ? [template.category] : []))),
      ].sort((left, right) => left.localeCompare(right)),
    [templates],
  );

  const filtered = useMemo(() => {
    const needle = normalized(query);
    return templates.filter(
      (template) => matches(template, needle) && (!category || template.category === category),
    );
  }, [templates, query, category]);

  const hasFilters = Boolean(query.trim() || category);

  return (
    <section className="warehouse-catalog" aria-label={t('catalog')}>
      <header className="warehouse-catalog-toolbar">
        <div>
          <label htmlFor="warehouse-template-search">{t('search')}</label>
          <input
            id="warehouse-template-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchPlaceholder')}
          />
        </div>
        <div>
          <label htmlFor="warehouse-category-filter">{t('category')}</label>
          <select
            id="warehouse-category-filter"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">{t('allCategories')}</option>
            {categories.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <strong>{t('count', { count: filtered.length, total: templates.length })}</strong>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setCategory('');
            }}
          >
            {t('clear')}
          </button>
        ) : null}
      </header>

      <div className="warehouse-template-grid">
        {filtered.length ? (
          filtered.map((template) => (
            <article key={template.id} className="warehouse-template-card">
              <header>
                <span>{t('equipment')}</span>
                <b>v{template.version}</b>
              </header>
              <h2>{template.name}</h2>
              <p>
                {[template.manufacturer, template.model].filter(Boolean).join(' · ') ||
                  t('manufacturerUndefined')}
              </p>
              <dl>
                <dt>{t('category')}</dt>
                <dd>{template.category ?? '—'}</dd>
                <dt>{t('equipmentType')}</dt>
                <dd>{template.equipmentType?.replaceAll('_', ' ') ?? 'CUSTOM'}</dd>
                <dt>{t('composition')}</dt>
                <dd>{t('compositionHelp')}</dd>
                <dt>{t('allowedTypes')}</dt>
                <dd>
                  {template.allowedChildTypes?.length
                    ? template.allowedChildTypes.map((type) => type.replaceAll('_', ' ')).join(', ')
                    : t('anyType')}
                </dd>
                <dt>{t('rackSize')}</dt>
                <dd>{template.sizeU ? `${template.sizeU}U` : '—'}</dd>
                <dt>{t('dimensions')}</dt>
                <dd>
                  {template.dimensionsMm
                    ? `${template.dimensionsMm.width} × ${template.dimensionsMm.depth} mm`
                    : '—'}
                </dd>
              </dl>
              {template.notes && <small>{template.notes}</small>}
            </article>
          ))
        ) : (
          <div className="warehouse-empty">
            <strong>{t('noMatch')}</strong>
            <p>{t('changeFilters')}</p>
            {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategory('');
                }}
              >
                {t('clear')}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
