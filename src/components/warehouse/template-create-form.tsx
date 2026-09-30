'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const JSON_EXAMPLE = `{
  "kind": "DEVICE",
  "name": "Cisco Catalyst 9300-48P",
  "manufacturer": "Cisco",
  "model": "C9300-48P",
  "category": "Network switch",
  "sizeU": 1,
  "dimensionsMm": {
    "width": 482,
    "depth": 445
  },
  "notes": "Reusable defaults and mounting notes"
}`;

export function TemplateCreateForm() {
  const router = useRouter();
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
          kind: String(form.get('kind')),
          name: String(form.get('name') ?? ''),
          manufacturer: String(form.get('manufacturer') ?? ''),
          model: String(form.get('model') ?? ''),
          category: String(form.get('category') ?? ''),
          sizeU: number('sizeU'),
          widthMm: number('widthMm'),
          depthMm: number('depthMm'),
          notes: String(form.get('notes') ?? ''),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'CREATE_FAILED');
      event.currentTarget.reset();
      setResult('Template created.');
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
      setError('INVALID_JSON');
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
        const index =
          typeof data.index === 'number' ? ` · item ${data.index + 1}` : '';
        const imported =
          typeof data.imported === 'number' && data.imported > 0
            ? ` · ${data.imported} imported before failure`
            : '';
        throw new Error(`${data.error ?? 'IMPORT_FAILED'}${index}${imported}`);
      }
      setResult(`${data.imported ?? 0} template(s) imported.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'IMPORT_FAILED');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="warehouse-template-create">
      <div className="warehouse-create-mode" role="tablist" aria-label="Template creation mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'form'}
          className={mode === 'form' ? 'is-active' : undefined}
          onClick={() => setMode('form')}
        >
          FORM
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
              Type
              <select name="kind" defaultValue="DEVICE">
                <option value="DEVICE">Device</option>
                <option value="EQUIPMENT">Equipment</option>
              </select>
            </label>
            <label>
              Template name
              <input name="name" required maxLength={120} placeholder="Cisco Catalyst 9300-48P" />
            </label>
            <label>
              Manufacturer
              <input name="manufacturer" maxLength={120} placeholder="Cisco" />
            </label>
            <label>
              Model
              <input name="model" maxLength={120} placeholder="C9300-48P" />
            </label>
            <label>
              Category
              <input name="category" maxLength={120} placeholder="Network switch" />
            </label>
            <label>
              Size (U)
              <input name="sizeU" type="number" min="1" max="100" placeholder="1" />
            </label>
            <label>
              Width (mm)
              <input name="widthMm" type="number" min="1" max="10000" placeholder="482" />
            </label>
            <label>
              Depth (mm)
              <input name="depthMm" type="number" min="1" max="10000" placeholder="445" />
            </label>
          </div>
          <label>
            Notes
            <textarea
              name="notes"
              rows={2}
              maxLength={500}
              placeholder="Reusable defaults and mounting notes"
            />
          </label>
          <div className="warehouse-form-actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create template'}
            </button>
          </div>
        </form>
      ) : (
        <section className="warehouse-json-import" aria-label="JSON template import">
          <div className="warehouse-json-copy">
            <strong>Paste one template or an array of templates.</strong>
            <span>
              Accepted dimensions: <code>dimensionsMm.width/depth</code> or flat{' '}
              <code>widthMm/depthMm</code>.
            </span>
          </div>
          <textarea
            aria-label="Template JSON"
            value={jsonValue}
            onChange={(event) => setJsonValue(event.target.value)}
            spellCheck={false}
          />
          <div className="warehouse-json-actions">
            <button type="button" onClick={() => setJsonValue(JSON_EXAMPLE)} disabled={busy}>
              Load example
            </button>
            <button type="button" onClick={() => void importJson()} disabled={busy}>
              {busy ? 'Importing…' : 'Import JSON'}
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
