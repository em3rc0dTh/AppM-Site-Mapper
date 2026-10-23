'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import type { EquipmentChildMode } from '@/modules/topology/domain/entities';

import { DEVICE_TYPES, EQUIPMENT_TYPES } from '@/modules/topology/domain/type-parsers';
import type { AssetTemplate } from '@/modules/warehouse/domain/template';

export function RackTemplateInstantiator({ rackId }: { rackId: string }) {
  const router = useRouter();
  const t = useTranslations('warehouseForms');
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<readonly AssetTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [childMode, setChildMode] = useState<EquipmentChildMode>('DYNAMIC');
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
          childMode,
          telemetryPointPrefix: String(form.get('telemetryPointPrefix') ?? ''),
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
        {t('mount')}
      </button>
      {open && (
        <form onSubmit={submit} className="rack-warehouse-form">
          <header>
            <strong>{t('instantiate')}</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('closeMount')}>
              ×
            </button>
          </header>
          {templates.length ? (
            <>
              <label>
                {t('template')}
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
                      t('noManufacturer')}
                  </span>
                  <span>
                    {selected.sizeU ? `${selected.sizeU}U` : t('noU')}
                    {selected.category ? ` · ${selected.category}` : ''}
                  </span>
                  <span>
                    {selected.equipmentType ?? 'CUSTOM'} · Configure child slots and layout for this
                    instance below
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
                  <option value="">{t('useTemplate',{type:selected?.equipmentType??'CUSTOM'})}</option>
                  {EQUIPMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Children mode · This instance
                <select
                  name="childMode"
                  value={childMode}
                  onChange={(event) => setChildMode(event.target.value as EquipmentChildMode)}
                >
                  <option value="DYNAMIC">{t('dynamic')}</option>
                  <option value="POSITIONAL">{t('positional')}</option>
                </select>
              </label>
              {childMode === 'POSITIONAL' ? (
                <label>
                  Child slots · This instance
                  <input
                    name="childCapacity"
                    type="number"
                    min="1"
                    max="256"
                    required
                    placeholder={t('slotsPlaceholder')}
                  />
                </label>
              ) : null}
              {childMode === 'POSITIONAL' ? (
                <label>
                  MQTT point prefix
                  <input
                    name="telemetryPointPrefix"
                    maxLength={80}
                    pattern="[A-Za-z0-9]+(_[A-Za-z0-9]+)*"
                    placeholder={t('prefixPlaceholder')}
                  />
                </label>
              ) : null}
              <fieldset className="warehouse-presentation-controls">
                <legend>{t('childLayout')}</legend>
                <label>
                  {t('direction')}
                  <select name="presentationDirection" defaultValue="ROW">
                    <option value="ROW">{t('row')}</option>
                    <option value="COLUMN">{t('column')}</option>
                  </select>
                </label>
                <label>
                  {t('perLine')}
                  <select name="presentationMaxPerLine" defaultValue="auto">
                    <option value="auto">{t('auto')}</option>
                    {Array.from({ length: 256 }, (_, index) => index + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('visibility')}
                  <select name="presentationVisibility" defaultValue="AUTO">
                    <option value="AUTO">{t('autoVisibility')}</option>
                    <option value="INLINE">{t('inline')}</option>
                    <option value="SUMMARY">{t('summary')}</option>
                  </select>
                </label>
                <small>{t('perInstance')}</small>
              </fieldset>
              <label>
                {t('serial')}
                <input name="serialNumber" maxLength={120} />
              </label>
              <label>
                {t('categoryOverride')}
                <input name="category" maxLength={120} placeholder={selected?.category ?? ''} />
              </label>
              <button type="submit" disabled={busy || !templateId}>
                {busy ? t('creating') : t('createDevice')}
              </button>
            </>
          ) : (
            <p>{t('noActive')}</p>
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
