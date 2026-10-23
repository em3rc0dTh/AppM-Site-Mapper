'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { EQUIPMENT_TYPES } from '@/modules/topology/domain/type-parsers';

const JSON_EXAMPLE = JSON.stringify(
  {
    kind: 'EQUIPMENT',
    name: 'BDFB Panel 24P',
    category: 'BDFB distribution panel',
    equipmentType: 'PANEL',
    allowedChildTypes: ['CIRCUIT_BREAKER'],
    notes: 'Reusable Panel Equipment type; configure physical slots when instantiating',
  },
  null,
  2,
);

export function TemplateCreateForm() {
  const router = useRouter();
  const t = useTranslations('warehouseForms');
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonValue, setJsonValue] = useState(JSON_EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = (name: string) => {
      const raw = String(form.get(name) ?? '').trim();
      return raw ? Number(raw) : undefined;
    };

    setBusy(true);
    setError('');
    setResult('');
    try {
      const response = await fetch('/api/warehouse/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'EQUIPMENT',
          name: String(form.get('name') ?? ''),
          manufacturer: String(form.get('manufacturer') ?? ''),
          model: String(form.get('model') ?? ''),
          category: String(form.get('category') ?? ''),
          sizeU: number('sizeU'),
          widthMm: number('widthMm'),
          depthMm: number('depthMm'),
          notes: String(form.get('notes') ?? ''),
          equipmentType: String(form.get('equipmentType') ?? 'CUSTOM'),
          allowedChildTypes: form.getAll('allowedChildTypes').map(String),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'CREATE_FAILED');
      event.currentTarget.reset();
      setResult(t('created'));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CREATE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function importJson() {
    setBusy(true);
    setError('');
    setResult('');

    try {
      JSON.parse(jsonValue);
    } catch {
      setError(t('invalidJson'));
      setBusy(false);
      return;
    }

    try {
      const response = await fetch('/api/warehouse/templates/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: jsonValue,
      });
      const data = (await response.json()) as {
        error?: string;
        index?: number;
        imported?: number;
      };
      if (!response.ok) {
        const index = typeof data.index === 'number' ? ` · item ${data.index + 1}` : '';
        const imported =
          typeof data.imported === 'number' && data.imported > 0
            ? ` · ${data.imported} imported before failure`
            : '';
        throw new Error(`${data.error ?? 'IMPORT_FAILED'}${index}${imported}`);
      }
      setResult(t('imported', { count: data.imported ?? 0 }));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'IMPORT_FAILED');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="warehouse-template-create">
      <div className="warehouse-create-mode" role="tablist" aria-label={t('creation')}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'form'}
          className={mode === 'form' ? 'is-active' : undefined}
          onClick={() => setMode('form')}
        >
          {t('form')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'json'}
          className={mode === 'json' ? 'is-active' : undefined}
          onClick={() => setMode('json')}
        >
          JSON
        </button>
      </div>

      {mode === 'form' ? (
        <form className="warehouse-template-form" onSubmit={submit}>
          <div className="warehouse-form-grid">
            <label>
              {t('templateName')}
              <input name="name" required maxLength={120} placeholder="BDFB Panel 24P" />
            </label>
            <label>
              {t('equipmentType')}
              <select name="equipmentType" defaultValue="CUSTOM">
                {EQUIPMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('manufacturer')}
              <input name="manufacturer" maxLength={120} placeholder="Cisco" />
            </label>
            <label>
              {t('model')}
              <input name="model" maxLength={120} placeholder="C9300-48P" />
            </label>
            <label>
              {t('category')}
              <input name="category" maxLength={120} placeholder="Network switch" />
            </label>
            <label>
              {t('size')}
              <input name="sizeU" type="number" min="1" max="100" placeholder="1" />
            </label>
            <label>
              {t('width')}
              <input name="widthMm" type="number" min="1" max="10000" placeholder="482" />
            </label>
            <label>
              {t('depth')}
              <input name="depthMm" type="number" min="1" max="10000" placeholder="445" />
            </label>
          </div>
          <label>
            {t('childTypes')}
            <select name="allowedChildTypes" multiple size={5}>
              {EQUIPMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('notes')}
            <textarea name="notes" rows={2} maxLength={500} placeholder={t('notesPlaceholder')} />
          </label>
          <div className="warehouse-form-actions">
            <button type="submit" disabled={busy}>
              {busy ? t('creating') : t('create')}
            </button>
          </div>
        </form>
      ) : (
        <section className="warehouse-json-import" aria-label={t('jsonImport')}>
          <div className="warehouse-json-copy">
            <strong>{t('paste')}</strong>
            <span>{t('jsonGuide')}</span>
          </div>
          <textarea
            aria-label={t('templateJson')}
            value={jsonValue}
            onChange={(event) => setJsonValue(event.target.value)}
            spellCheck={false}
          />
          <div className="warehouse-json-actions">
            <button type="button" onClick={() => setJsonValue(JSON_EXAMPLE)} disabled={busy}>
              {t('example')}
            </button>
            <button type="button" onClick={() => void importJson()} disabled={busy}>
              {busy ? t('importing') : t('importJson')}
            </button>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {result && <p className="warehouse-form-success">{result}</p>}
    </div>
  );
}
