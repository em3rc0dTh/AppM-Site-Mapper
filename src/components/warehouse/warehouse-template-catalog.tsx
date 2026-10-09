'use client';

import { useMemo, useState } from 'react';

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
    <section className="warehouse-catalog" aria-label="Equipment template catalog">
      <header className="warehouse-catalog-toolbar">
        <div>
          <label htmlFor="warehouse-template-search">Search equipment</label>
          <input
            id="warehouse-template-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, category, manufacturer or model…"
          />
        </div>
        <div>
          <label htmlFor="warehouse-category-filter">Category</label>
          <select
            id="warehouse-category-filter"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <strong>
          {filtered.length} of {templates.length}
        </strong>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setCategory('');
            }}
          >
            Clear filters
          </button>
        ) : null}
      </header>

      <div className="warehouse-template-grid">
        {filtered.length ? (
          filtered.map((template) => (
            <article key={template.id} className="warehouse-template-card">
              <header>
                <span>EQUIPMENT</span>
                <b>v{template.version}</b>
              </header>
              <h2>{template.name}</h2>
              <p>
                {[template.manufacturer, template.model].filter(Boolean).join(' · ') ||
                  'Manufacturer/model not defined'}
              </p>
              <dl>
                <dt>Category</dt>
                <dd>{template.category ?? '—'}</dd>
                <dt>Equipment type</dt>
                <dd>{template.equipmentType?.replaceAll('_', ' ') ?? 'CUSTOM'}</dd>
                <dt>Children</dt>
                <dd>
                  {template.childMode === 'POSITIONAL'
                    ? `${template.childCapacity ?? 0} positional slots`
                    : 'Dynamic'}
                </dd>
                <dt>Allowed child types</dt>
                <dd>
                  {template.allowedChildTypes?.length
                    ? template.allowedChildTypes.map((type) => type.replaceAll('_', ' ')).join(', ')
                    : 'Any Equipment type'}
                </dd>
                <dt>Rack size</dt>
                <dd>{template.sizeU ? `${template.sizeU}U` : '—'}</dd>
                <dt>Dimensions</dt>
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
            <strong>No matching Equipment templates</strong>
            <p>Change the search text or category filter.</p>
            {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategory('');
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
