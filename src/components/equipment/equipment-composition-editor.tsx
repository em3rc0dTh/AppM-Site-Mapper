'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import type {
  EquipmentChildMode,
  EquipmentNode,
  EquipmentType,
} from '@/modules/topology/domain/entities';
import type { AssetTemplate } from '@/modules/warehouse/domain/template';

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

function label(type: EquipmentType): string {
  return type.replaceAll('_', ' ');
}

export function EquipmentCompositionEditor({
  equipment,
  children,
  canWrite,
}: Readonly<{
  equipment: EquipmentNode;
  children: readonly EquipmentNode[];
  canWrite: boolean;
}>) {
  const router = useRouter();
  const byId = useMemo(() => new Map(children.map((child) => [child.id, child])), [children]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [configurationMode, setConfigurationMode] = useState<EquipmentChildMode>(
    equipment.childMode,
  );
  const [targetSlot, setTargetSlot] = useState<number | null>(null);
  const [mode, setMode] = useState<'warehouse' | 'one-off'>('warehouse');
  const [oneOffChildMode, setOneOffChildMode] = useState<EquipmentChildMode>('DYNAMIC');
  const [templates, setTemplates] = useState<readonly AssetTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const allowed = equipment.template?.allowedChildTypes ?? [];
  const availableSlots =
    equipment.childMode === 'POSITIONAL'
      ? equipment.children.flatMap((childId, index) => (childId === null ? [index] : []))
      : [];

  const selectedTemplate = templates.find((template) => template.id === templateId);

  async function loadTemplates() {
    if (templates.length || loadingTemplates) return;
    setLoadingTemplates(true);
    setError('');
    try {
      const response = await fetch('/api/warehouse/templates');
      const data = (await response.json()) as { templates?: AssetTemplate[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'WAREHOUSE_LOAD_FAILED');
      const next = (data.templates ?? []).filter(
        (template) =>
          !allowed.length ||
          !template.equipmentType ||
          allowed.includes(template.equipmentType),
      );
      setTemplates(next);
      setTemplateId(next[0]?.id ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'WAREHOUSE_LOAD_FAILED');
    } finally {
      setLoadingTemplates(false);
    }
  }

  function openComposer(slot: number | null) {
    setTargetSlot(slot);
    setComposerOpen(true);
    setError('');
    void loadTemplates();
  }

  async function configureEquipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/topology/' + encodeURIComponent(equipment.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'configure-equipment',
          equipmentType: String(form.get('equipmentType') ?? equipment.equipmentType),
          childMode: configurationMode,
          childCapacity:
            configurationMode === 'POSITIONAL'
              ? Number(form.get('childCapacity'))
              : undefined,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'CONFIGURE_FAILED');
      setConfigurationOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CONFIGURE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function createFromWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/warehouse/instantiate-equipment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateId,
          parentEquipmentId: equipment.id,
          ...(targetSlot === null ? {} : { slotIndex: targetSlot }),
          name: String(form.get('name') ?? ''),
          serialNumber: String(form.get('serialNumber') ?? ''),
          category: String(form.get('category') ?? ''),
          equipmentType: String(form.get('equipmentType') ?? '') || undefined,
          childMode: String(form.get('childMode') ?? '') || undefined,
          childCapacity: String(form.get('childCapacity') ?? '').trim()
            ? Number(form.get('childCapacity'))
            : undefined,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'CREATE_FAILED');
      setComposerOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CREATE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function createOneOff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const childMode = oneOffChildMode;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/topology', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'EQUIPMENT',
          parentId: equipment.id,
          ...(targetSlot === null ? {} : { parentSlotIndex: targetSlot }),
          name: String(form.get('name') ?? ''),
          serialNumber: String(form.get('serialNumber') ?? ''),
          category: String(form.get('category') ?? ''),
          equipmentType: String(form.get('equipmentType') ?? 'CUSTOM'),
          childMode,
          childCapacity:
            childMode === 'POSITIONAL' ? Number(form.get('childCapacity')) : undefined,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'CREATE_FAILED');
      setComposerOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CREATE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function moveChild(childId: string, slotIndex: number) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/topology/' + encodeURIComponent(childId), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'move',
          parentId: equipment.id,
          slotIndex,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'MOVE_FAILED');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'MOVE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function detachChild(childId: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/topology/' + encodeURIComponent(childId), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'move',
          parentId: equipment.deviceId,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'DETACH_FAILED');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'DETACH_FAILED');
    } finally {
      setBusy(false);
    }
  }

  const defaultOneOffType: EquipmentType =
    allowed.length === 1 && allowed[0] ? allowed[0] : 'CUSTOM';
  const defaultWarehouseType: EquipmentType | '' =
    selectedTemplate?.equipmentType
      ? ''
      : allowed.length === 1 && allowed[0]
        ? allowed[0]
        : '';

  return (
    <section className="equipment-composition">
      <header className="equipment-composition-header">
        <div>
          <span>PHYSICAL COMPOSITION</span>
          <h2>{equipment.name}</h2>
          <small>
            {label(equipment.equipmentType)} · {equipment.childMode}
            {equipment.childMode === 'POSITIONAL'
              ? ' · ' + equipment.children.length + ' slots'
              : ' · ' + equipment.children.length + ' children'}
          </small>
        </div>
        <div className="equipment-composition-policy">
          {allowed.length ? (
            <p>Allowed children: {allowed.map(label).join(', ')}</p>
          ) : (
            <p>Allowed children: any Equipment type</p>
          )}
          {canWrite ? (
            <button
              type="button"
              onClick={() => {
                setConfigurationMode(equipment.childMode);
                setConfigurationOpen((value) => !value);
              }}
            >
              CONFIGURE EQUIPMENT
            </button>
          ) : null}
        </div>
      </header>

      {configurationOpen ? (
        <form className="equipment-configuration-form" onSubmit={configureEquipment}>
          <label>
            Equipment type
            <select name="equipmentType" defaultValue={equipment.equipmentType}>
              {EQUIPMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {label(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Children mode
            <select
              name="childMode"
              value={configurationMode}
              onChange={(event) =>
                setConfigurationMode(event.target.value as EquipmentChildMode)
              }
            >
              <option value="DYNAMIC">Dynamic</option>
              <option value="POSITIONAL">Positional slots</option>
            </select>
          </label>
          {configurationMode === 'POSITIONAL' ? (
            <label>
              Child slots
              <input
                name="childCapacity"
                type="number"
                min="1"
                max="256"
                required
                defaultValue={
                  equipment.childMode === 'POSITIONAL'
                    ? equipment.children.length
                    : Math.max(1, equipment.children.length)
                }
              />
            </label>
          ) : null}
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save composition'}
          </button>
        </form>
      ) : null}

      {equipment.childMode === 'POSITIONAL' ? (
        <div className="equipment-slot-grid">
          {equipment.children.map((childId, index) => {
            const child = childId ? byId.get(childId) : undefined;
            return (
              <article
                className={'equipment-slot ' + (childId ? 'is-occupied' : 'is-available')}
                key={String(index)}
              >
                <header>
                  <span>POSITION {String(index + 1).padStart(2, '0')}</span>
                  <b>{childId ? 'OCCUPIED' : 'AVAILABLE'}</b>
                </header>
                {child ? (
                  <>
                    <Link href={'/device/' + encodeURIComponent(child.id)}>
                      <strong>{child.name}</strong>
                      <small>{label(child.equipmentType)}</small>
                    </Link>
                    {canWrite ? (
                      <div className="equipment-slot-actions">
                        {availableSlots.length ? (
                          <select
                            aria-label={'Move ' + child.name + ' to slot'}
                            defaultValue=""
                            disabled={busy}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (value) void moveChild(child.id, Number(value));
                              event.currentTarget.value = '';
                            }}
                          >
                            <option value="">Move to…</option>
                            {availableSlots.map((slot) => (
                              <option key={slot} value={slot}>
                                Position {String(slot + 1).padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void detachChild(child.id)}
                        >
                          Detach to Device
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : childId ? (
                  <div className="equipment-slot-missing">
                    <strong>Referenced Equipment unavailable</strong>
                    <small>{childId}</small>
                  </div>
                ) : canWrite ? (
                  <button type="button" onClick={() => openComposer(index)}>
                    + ADD EQUIPMENT
                  </button>
                ) : (
                  <span>Empty slot</span>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="equipment-dynamic-list">
          {equipment.children.length ? (
            equipment.children.map((childId) => {
              if (!childId) return null;
              const child = byId.get(childId);
              return child ? (
                <article key={child.id}>
                  <Link href={'/device/' + encodeURIComponent(child.id)}>
                    <strong>{child.name}</strong>
                    <small>{label(child.equipmentType)}</small>
                  </Link>
                  {canWrite ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void detachChild(child.id)}
                    >
                      Detach to Device
                    </button>
                  ) : null}
                </article>
              ) : (
                <article key={childId} className="equipment-slot-missing">
                  <strong>Referenced Equipment unavailable</strong>
                  <small>{childId}</small>
                </article>
              );
            })
          ) : (
            <p>No child Equipment installed.</p>
          )}
          {canWrite ? (
            <button type="button" onClick={() => openComposer(null)}>
              + ADD EQUIPMENT
            </button>
          ) : null}
        </div>
      )}

      {composerOpen ? (
        <div className="equipment-composer">
          <header>
            <div>
              <strong>
                Add Equipment
                {targetSlot === null
                  ? ''
                  : ' · Position ' + String(targetSlot + 1).padStart(2, '0')}
              </strong>
              <small>Parent: {equipment.name}</small>
            </div>
            <button type="button" onClick={() => setComposerOpen(false)} aria-label="Close">
              ×
            </button>
          </header>

          <div className="equipment-composer-tabs">
            <button
              type="button"
              className={mode === 'warehouse' ? 'is-active' : undefined}
              onClick={() => setMode('warehouse')}
            >
              FROM WAREHOUSE
            </button>
            <button
              type="button"
              className={mode === 'one-off' ? 'is-active' : undefined}
              onClick={() => setMode('one-off')}
            >
              ONE-OFF
            </button>
          </div>

          {mode === 'warehouse' ? (
            <form onSubmit={createFromWarehouse}>
              <label>
                Equipment template
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  disabled={loadingTemplates}
                  required
                >
                  {!templates.length ? (
                    <option value="">
                      {loadingTemplates ? 'Loading templates…' : 'No compatible templates'}
                    </option>
                  ) : null}
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · {template.equipmentType ?? 'CUSTOM'}
                    </option>
                  ))}
                </select>
              </label>
              {selectedTemplate ? (
                <div className="equipment-template-preview">
                  <strong>{selectedTemplate.name}</strong>
                  <span>
                    {selectedTemplate.equipmentType ?? 'CUSTOM'} ·{' '}
                    {selectedTemplate.childMode === 'POSITIONAL'
                      ? String(selectedTemplate.childCapacity ?? 0) + ' slots'
                      : 'dynamic'}
                  </span>
                </div>
              ) : null}
              <label>
                Instance name
                <input
                  name="name"
                  maxLength={120}
                  placeholder={selectedTemplate?.name ?? 'Equipment name'}
                />
              </label>
              <label>
                Equipment type override
                <select
                  key={templateId + ':' + defaultWarehouseType}
                  name="equipmentType"
                  defaultValue={defaultWarehouseType}
                >
                  <option value="">Use template</option>
                  {EQUIPMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {label(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Children mode override
                <select name="childMode" defaultValue="">
                  <option value="">Use template</option>
                  <option value="DYNAMIC">Dynamic</option>
                  <option value="POSITIONAL">Positional</option>
                </select>
              </label>
              <label>
                Child slots override
                <input name="childCapacity" type="number" min="1" max="256" />
              </label>
              <label>
                Serial number
                <input name="serialNumber" maxLength={120} />
              </label>
              <label>
                Category override
                <input name="category" maxLength={120} />
              </label>
              <button type="submit" disabled={busy || !templateId}>
                {busy ? 'Creating…' : 'Install Equipment'}
              </button>
            </form>
          ) : (
            <form onSubmit={createOneOff}>
              <label>
                Name
                <input name="name" required maxLength={120} />
              </label>
              <label>
                Equipment type
                <select name="equipmentType" defaultValue={defaultOneOffType}>
                  {EQUIPMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {label(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Children mode
                <select
                  name="childMode"
                  value={oneOffChildMode}
                  onChange={(event) =>
                    setOneOffChildMode(event.target.value as EquipmentChildMode)
                  }
                >
                  <option value="DYNAMIC">Dynamic</option>
                  <option value="POSITIONAL">Positional</option>
                </select>
              </label>
              {oneOffChildMode === 'POSITIONAL' ? (
                <label>
                  Child slots
                  <input
                    name="childCapacity"
                    type="number"
                    min="1"
                    max="256"
                    required
                    placeholder="Number of physical positions"
                  />
                </label>
              ) : null}
              <label>
                Serial number
                <input name="serialNumber" maxLength={120} />
              </label>
              <label>
                Category
                <input name="category" maxLength={120} />
              </label>
              <button type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create and install'}
              </button>
            </form>
          )}

          {error ? <p role="alert">{error}</p> : null}
        </div>
      ) : null}

      {!composerOpen && error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
