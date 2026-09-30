'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function TemplateCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = (name: string) => {
      const raw = String(form.get(name) ?? '').trim();
      return raw ? Number(raw) : undefined;
    };

    setBusy(true);
    setError('');
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
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CREATE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  return (
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
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
