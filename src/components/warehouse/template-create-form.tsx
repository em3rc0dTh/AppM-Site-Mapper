'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { EquipmentChildMode, EquipmentType } from '@/modules/topology/domain/entities';

const EQUIPMENT_TYPES: readonly EquipmentType[] = [
  'CHASSIS',
  'SHELF',
  'SUB_SHELF',
  'FRAME',
  'PANEL',
  'CIRCUIT_BREAKER',
  'POWER_SUPPLY',
  'POWER_MODULE',
  'CONTROLLER_BOARD',
  'NETWORK_BOARD',
  'PLUGGABLE_MODULE',
  'FAN',
  'CUSTOM',
];

const JSON_EXAMPLE = JSON.stringify(
  {
    kind: 'EQUIPMENT',
    name: 'BDFB Panel 24P',
    category: 'BDFB distribution panel',
    equipmentType: 'PANEL',
    childMode: 'POSITIONAL',
    childCapacity: 24,
    allowedChildTypes: ['CIRCUIT_BREAKER'],
    notes: '24 positional slots; empty positions are null',
  },
  null,
  2,
);

export function TemplateCreateForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [childMode, setChildMode] = useState<EquipmentChildMode>('DYNAMIC');
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
          childMode,
          childCapacity: childMode === 'POSITIONAL' ? number('childCapacity') : undefined,
          allowedChildTypes: form.getAll('allowedChildTypes').map(String),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'CREATE_FAILED');
      event.currentTarget.reset();
      setChildMode('DYNAMIC');
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
        const index = typeof data.index === 'number' ? ` · item ${data.index + 1}` : '';
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
              Template name
              <input name="name" required maxLength={120} placeholder="BDFB Panel 24P" />
            </label>
            <label>
              Equipment type
              <select name="equipmentType" defaultValue="CUSTOM">
                {EQUIPMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Children mode
              <select
                name="childMode"
                value={childMode}
                onChange={(event) => setChildMode(event.target.value as EquipmentChildMode)}
              >
                <option value="DYNAMIC">Dynamic</option>
                <option value="POSITIONAL">Positional slots</option>
              </select>
            </label>
            {childMode === 'POSITIONAL' ? (
              <label>
                Child slots
                <input name="childCapacity" type="number" min="1" max="256" required placeholder="24" />
              </label>
            ) : null}
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
            Allowed child Equipment types
            <select name="allowedChildTypes" multiple size={5}>
              {EQUIPMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
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
              Equipment templates only. Recursive defaults use <code>equipmentType</code>,{' '}
              <code>childMode</code>, <code>childCapacity</code> and <code>allowedChildTypes</code>.
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
              Equipment example
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
