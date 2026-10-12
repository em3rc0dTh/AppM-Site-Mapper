'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { DEVICE_TYPES, EQUIPMENT_TYPES } from '@/modules/topology/domain/type-parsers';
import type { AssetTemplate } from '@/modules/warehouse/domain/template';

export function RackTemplateInstantiator({ rackId }: { rackId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<readonly AssetTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || templates.length) return;
    void fetch('/api/warehouse/templates')
      .then(async (response) => {
        const data = (await response.json()) as { templates?: AssetTemplate[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? 'WAREHOUSE_LOAD_FAILED');
        setTemplates(data.templates ?? []);
        setTemplateId(data.templates?.[0]?.id ?? '');
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'WAREHOUSE_LOAD_FAILED'),
      );
  }, [open, templates.length]);

  const selected = templates.find((template) => template.id === templateId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/warehouse/instantiate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateId,
          rackId,
          name: String(form.get('name') ?? ''),
          serialNumber: String(form.get('serialNumber') ?? ''),
          category: String(form.get('category') ?? ''),
          deviceType: String(form.get('deviceType') ?? 'CUSTOM'),
          equipmentType: String(form.get('equipmentType') ?? '') || undefined,
          childMode: String(form.get('childMode') ?? '') || undefined,
          childCapacity: String(form.get('childCapacity') ?? '').trim()
            ? Number(form.get('childCapacity'))
            : undefined,
          presentation: {
            direction: String(form.get('presentationDirection') ?? 'ROW'),
            maxPerLine:
              form.get('presentationMaxPerLine') === 'auto'
                ? null
                : Number(form.get('presentationMaxPerLine')),
            childrenVisibility: String(form.get('presentationVisibility') ?? 'AUTO'),
          },
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'INSTANTIATE_FAILED');
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'INSTANTIATE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rack-warehouse-mount">
      <button type="button" onClick={() => setOpen((value) => !value)}>
        + MOUNT FROM WAREHOUSE
      </button>
      {open && (
        <form onSubmit={submit} className="rack-warehouse-form">
          <header>
            <strong>Instantiate from template</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close warehouse mount">
              ×
            </button>
          </header>
          {templates.length ? (
            <>
              <label>
                Template
                <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · {template.kind}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <div className="rack-template-preview">
                  <strong>{selected.name}</strong>
                  <span>
                    {[selected.manufacturer, selected.model].filter(Boolean).join(' · ') ||
                      'No manufacturer/model'}
                  </span>
                  <span>
                    {selected.sizeU ? `${selected.sizeU}U` : 'U not defined'}
                    {selected.category ? ` · ${selected.category}` : ''}
                  </span>
                  <span>
                    {selected.equipmentType ?? 'CUSTOM'} ·{' '}
                    {selected.childMode === 'POSITIONAL'
                      ? `${selected.childCapacity ?? 0} slots`
                      : 'dynamic children'}
                  </span>
                  <span>
                    Layout: {selected.presentation?.direction ?? 'ROW'} · Max per line:{' '}
                    {selected.presentation?.maxPerLine ?? 'Auto'} · Display:{' '}
                    {selected.presentation?.childrenVisibility ?? 'AUTO'}
                  </span>
                </div>
              )}
              <label>
                Device identity
                <input name="name" required maxLength={120} placeholder="BDFB-01" />
              </label>
              <label>
                Operational type
                <select name="deviceType" defaultValue="CUSTOM">
                  {DEVICE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Physical Equipment type
                <select name="equipmentType" defaultValue="">
                  <option value="">Use template ({selected?.equipmentType ?? 'CUSTOM'})</option>
                  {EQUIPMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Children mode
                <select name="childMode" defaultValue="">
                  <option value="">Use template ({selected?.childMode ?? 'DYNAMIC'})</option>
                  <option value="DYNAMIC">Dynamic</option>
                  <option value="POSITIONAL">Positional slots</option>
                </select>
              </label>
              <label>
                Child slots
                <input
                  name="childCapacity"
                  type="number"
                  min="1"
                  max="256"
                  placeholder={
                    selected?.childMode === 'POSITIONAL'
                      ? String(selected.childCapacity ?? '')
                      : 'Only for positional mode'
                  }
                />
              </label>
              <fieldset className="warehouse-presentation-controls">
                <legend>Physical child layout · Equipment presentation</legend>
                <label>
                  Direction
                  <select
                    key={templateId + ':direction'}
                    name="presentationDirection"
                    defaultValue={selected?.presentation?.direction ?? 'ROW'}
                  >
                    <option value="ROW">ROW · Left to right</option>
                    <option value="COLUMN">COLUMN · Top to bottom</option>
                  </select>
                </label>
                <label>
                  Max per line
                  <select
                    key={templateId + ':max'}
                    name="presentationMaxPerLine"
                    defaultValue={selected?.presentation?.maxPerLine?.toString() ?? 'auto'}
                  >
                    <option value="auto">Auto · Responsive</option>
                    {Array.from({ length: 256 }, (_, index) => index + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Child visibility
                  <select
                    key={templateId + ':visibility'}
                    name="presentationVisibility"
                    defaultValue={selected?.presentation?.childrenVisibility ?? 'AUTO'}
                  >
                    <option value="AUTO">AUTO</option>
                    <option value="INLINE">INLINE</option>
                    <option value="SUMMARY">SUMMARY</option>
                  </select>
                </label>
                <small>
                  Preloaded from the template; you may override the layout for this Equipment only.
                </small>
              </fieldset>
              <label>
                Serial number
                <input name="serialNumber" maxLength={120} />
              </label>
              <label>
                Category override
                <input name="category" maxLength={120} placeholder={selected?.category ?? ''} />
              </label>
              <button type="submit" disabled={busy || !templateId}>
                {busy ? 'Creating…' : 'Create Device + unmounted Equipment'}
              </button>
            </>
          ) : (
            <p>No active templates. Create one in Virtual Warehouse first.</p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
