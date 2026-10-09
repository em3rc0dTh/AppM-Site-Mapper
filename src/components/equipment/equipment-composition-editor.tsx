'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import type {
  EquipmentChildMode,
  EquipmentNode,
  EquipmentType,
} from '@/modules/topology/domain/entities';
import { EQUIPMENT_TYPES } from '@/modules/topology/domain/type-parsers';
import type { AssetTemplate } from '@/modules/warehouse/domain/template';

function label(type: EquipmentType): string {
  return type.replaceAll('_', ' ');
}

export function EquipmentCompositionEditor({
  equipment,
  childEquipment,
  canWrite,
}: Readonly<{
  equipment: EquipmentNode;
  childEquipment: readonly EquipmentNode[];
  canWrite: boolean;
}>) {
  const router = useRouter();
  const byId = useMemo(
    () => new Map(childEquipment.map((child) => [child.id, child])),
    [childEquipment],
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [showFullComposition, setShowFullComposition] = useState(false);
  const [showPositionEditor, setShowPositionEditor] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [configurationMode, setConfigurationMode] = useState<EquipmentChildMode>(
    equipment.childMode,
  );
  const [layoutDirection, setLayoutDirection] = useState<'ROW' | 'COLUMN'>(equipment.presentation?.direction ?? 'ROW');
  const [maxPerLine, setMaxPerLine] = useState(equipment.presentation?.maxPerLine?.toString() ?? 'auto');
  const [childrenVisibility, setChildrenVisibility] = useState<'AUTO' | 'INLINE' | 'SUMMARY'>(equipment.presentation?.childrenVisibility ?? 'AUTO');
  const [targetSlot, setTargetSlot] = useState<number | null>(null);
  const [mode, setMode] = useState<'warehouse' | 'one-off'>('warehouse');
  const [warehouseChildMode, setWarehouseChildMode] = useState('');
  const [warehouseChildCapacity, setWarehouseChildCapacity] = useState('');
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
  const isActive = equipment.lifecycle === 'ACTIVE';
  const canArchive =
    isActive &&
    equipment.parentEquipmentId === null &&
    !equipment.rackPlacement &&
    equipment.children.every((childId) => childId === null);

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
          !allowed.length || !template.equipmentType || allowed.includes(template.equipmentType),
      );
      setTemplates(next);
      setTemplateId(next[0]?.id ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'WAREHOUSE_LOAD_FAILED');
    } finally {
      setLoadingTemplates(false);
    }
  }

  function compositionFromForm(form: FormData) {
    return {
      direction: String(form.get('presentationDirection') ?? 'ROW') as 'ROW' | 'COLUMN',
      maxPerLine: form.get('presentationMaxPerLine') === 'auto'
        ? null : Number(form.get('presentationMaxPerLine') ?? 2),
      childrenVisibility: String(form.get('presentationVisibility') ?? 'AUTO') as 'AUTO' | 'INLINE' | 'SUMMARY',
    };
  }

  function presentationFields(defaults?: AssetTemplate['presentation']) {
    return (
      <fieldset>
        <legend>Child composition layout</legend>
        <label>Layout direction
          <select key={'direction:' + (defaults?.direction ?? 'ROW')} name="presentationDirection" defaultValue={defaults?.direction ?? 'ROW'}>
            <option value="ROW">Row</option><option value="COLUMN">Column</option>
          </select>
        </label>
        <label>Max items per line
          <select key={'max:' + String(defaults?.maxPerLine)} name="presentationMaxPerLine" defaultValue={defaults?.maxPerLine?.toString() ?? 'auto'}>
            <option value="auto">Auto</option>
            {Array.from({ length: 256 }, (_, index) => index + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>Child display
          <select key={'visibility:' + (defaults?.childrenVisibility ?? 'AUTO')} name="presentationVisibility" defaultValue={defaults?.childrenVisibility ?? 'AUTO'}>
            <option value="AUTO">Auto</option><option value="INLINE">Inline</option><option value="SUMMARY">Summary</option>
          </select>
        </label>
      </fieldset>
    );
  }

  function openComposer(slot: number | null) {
    setTargetSlot(slot);
    setComposerOpen(true);
    setError('');
    void loadTemplates();
  }

  async function changeLifecycle(action: 'archive' | 'restore') {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/topology/' + encodeURIComponent(equipment.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? action.toUpperCase() + '_FAILED');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : action.toUpperCase() + '_FAILED');
    } finally {
      setBusy(false);
    }
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
          presentation: {
            direction: layoutDirection,
            maxPerLine: maxPerLine === 'auto' ? null : Number(maxPerLine),
            childrenVisibility,
          },
          childCapacity:
            configurationMode === 'POSITIONAL' ? Number(form.get('childCapacity')) : undefined,
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
    const resolvedMode = warehouseChildMode || selectedTemplate?.childMode || 'DYNAMIC';
    const resolvedCapacity = warehouseChildCapacity.trim()
      ? Number(warehouseChildCapacity)
      : warehouseChildMode === 'POSITIONAL' ? selectedTemplate?.childCapacity : undefined;
    if (resolvedMode === 'POSITIONAL' && (!Number.isInteger(resolvedCapacity) || (resolvedCapacity ?? 0) < 1)) {
      setError('POSITIONAL_REQUIRES_CHILD_SLOTS: choose 1–256 or use Dynamic for leaf Equipment.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/warehouse/instantiate-equipment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateId,
          presentation: compositionFromForm(form),
          parentEquipmentId: equipment.id,
          ...(targetSlot === null ? {} : { slotIndex: targetSlot }),
          name: String(form.get('name') ?? ''),
          serialNumber: String(form.get('serialNumber') ?? ''),
          category: String(form.get('category') ?? ''),
          equipmentType: String(form.get('equipmentType') ?? '') || undefined,
          childMode: warehouseChildMode || undefined,
          childCapacity: resolvedMode === 'POSITIONAL' ? resolvedCapacity : undefined,
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
          presentation: compositionFromForm(form),
          parentId: equipment.id,
          ...(targetSlot === null ? {} : { parentSlotIndex: targetSlot }),
          name: String(form.get('name') ?? ''),
          serialNumber: String(form.get('serialNumber') ?? ''),
          category: String(form.get('category') ?? ''),
          equipmentType: String(form.get('equipmentType') ?? 'CUSTOM'),
          childMode,
          childCapacity: childMode === 'POSITIONAL' ? Number(form.get('childCapacity')) : undefined,
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
  const defaultWarehouseType: EquipmentType | '' = selectedTemplate?.equipmentType
    ? ''
    : allowed.length === 1 && allowed[0]
      ? allowed[0]
      : '';

  const visibleCount = equipment.children.length;
  const displayPolicy = equipment.presentation?.childrenVisibility ?? 'AUTO';
  const summary = !showFullComposition && visibleCount > 4 && (displayPolicy === 'AUTO' || displayPolicy === 'SUMMARY');
  const lineLimit = equipment.presentation?.maxPerLine ?? visibleCount;
  const itemCount = Math.max(1, Math.min(visibleCount || 1, lineLimit));
  const compositionStyle = {
    display: 'grid',
    gridTemplateColumns: equipment.presentation?.direction === 'COLUMN'
      ? 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))'
      : `repeat(${itemCount}, minmax(0, 1fr))`,
    gridAutoFlow: equipment.presentation?.direction === 'COLUMN' ? 'column' : 'row',
    ...(equipment.presentation?.direction === 'COLUMN' ? { gridTemplateRows: `repeat(${itemCount}, auto)` } : {}),
    maxWidth: '100%',
  };
  return (
    <section className="equipment-composition">
      <header className="equipment-composition-header">
        <div>
          <span>PHYSICAL COMPOSITION</span>
          <h2>{equipment.name}</h2>
          <small>
            {label(equipment.equipmentType)} · {equipment.lifecycle} · {equipment.childMode}
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
            <div className="equipment-lifecycle-actions">
              {isActive ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setConfigurationMode(equipment.childMode);
                      setLayoutDirection(equipment.presentation?.direction ?? 'ROW');
                      setMaxPerLine(equipment.presentation?.maxPerLine?.toString() ?? 'auto');
                      setChildrenVisibility(equipment.presentation?.childrenVisibility ?? 'AUTO');
                      setConfigurationOpen((value) => !value);
                    }}
                  >
                    CONFIGURE EQUIPMENT
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    disabled={busy || !canArchive}
                    title={
                      canArchive
                        ? 'Archive Equipment'
                        : equipment.parentEquipmentId !== null
                          ? 'Detach this Equipment to the Device before archiving'
                          : equipment.rackPlacement
                            ? 'Release CAS placement before archiving'
                            : 'Archive requires no installed child Equipment'
                    }
                    onClick={() => void changeLifecycle('archive')}
                  >
                    ARCHIVE
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="is-restore"
                  disabled={busy}
                  onClick={() => void changeLifecycle('restore')}
                >
                  RESTORE
                </button>
              )}
            </div>
          ) : null}
        </div>
      </header>

      {isActive && configurationOpen ? (
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
              onChange={(event) => setConfigurationMode(event.target.value as EquipmentChildMode)}
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
          <label>
            Layout direction
            <select value={layoutDirection} onChange={(event) => setLayoutDirection(event.target.value as 'ROW' | 'COLUMN')}>
              <option value="ROW">Row</option>
              <option value="COLUMN">Column</option>
            </select>
          </label>
          <label>
            Max items per {layoutDirection === 'ROW' ? 'row' : 'column'}
            <select value={maxPerLine} onChange={(event) => setMaxPerLine(event.target.value)}>
              <option value="auto">Auto</option>
              {Array.from({ length: 256 }, (_, index) => index + 1).map((amount) => <option key={amount} value={amount}>{amount}</option>)}
            </select>
          </label>
          <label>
            Child display
            <select value={childrenVisibility} onChange={(event) => setChildrenVisibility(event.target.value as 'AUTO' | 'INLINE' | 'SUMMARY')}>
              <option value="AUTO">Auto</option>
              <option value="INLINE">Inline</option>
              <option value="SUMMARY">Summary</option>
            </select>
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save composition'}
          </button>
        </form>
      ) : null}

      <section aria-label="Physical equipment hierarchy" style={{ border: '2px solid #64748b', borderRadius: 8, padding: 16, marginBottom: 16, background: 'var(--surface, #fffdf3)' }}>
        <header style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <strong>PHYSICAL VIEW · {label(equipment.equipmentType)}</strong>
            <p style={{ margin: '4px 0', fontSize: 12 }}>{equipment.children.filter(Boolean).length} installed / {equipment.children.length} {equipment.childMode === 'POSITIONAL' ? 'positions' : 'children'} · select a child to drill down</p>
          </div>
          <button type="button" onClick={() => setShowPositionEditor((value) => !value)}>
            {showPositionEditor ? 'HIDE POSITION EDITOR' : 'MANAGE POSITIONS'}
          </button>
        </header>
        {equipment.children.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
            {equipment.children.map((childId, index) => {
              const child = childId ? byId.get(childId) : undefined;
              return (
                <div key={index} style={{ border: '2px solid #94a3b8', padding: 10, background: child ? '#eaf1f7' : '#f8fafc', borderRadius: 4, minWidth: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: 1, color: '#475569' }}>POSITION {String(index + 1).padStart(2, '0')}</div>
                  {child ? (
                    <Link href={'/device/' + encodeURIComponent(child.id)} style={{ display: 'block', color: '#172b42', textDecoration: 'none', marginTop: 7 }}>
                      <strong style={{ display: 'block', overflowWrap: 'anywhere' }}>{child.name}</strong>
                      <small>{label(child.equipmentType)} · {child.children.filter(Boolean).length}/{child.children.length} occupied</small>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12px, 1fr))', gap: 3, marginTop: 12 }}>
                        {child.children.slice(0, 24).map((slot, childIndex) => (
                          <span key={childIndex} title={`Position ${childIndex + 1}: ${slot ? 'Occupied' : 'Available'}`} style={{ height: 18, minWidth: 8, border: '1px solid #64748b', background: slot ? '#357a9f' : '#fff' }} />
                        ))}
                      </div>
                      {child.children.length > 24 ? <small>+{child.children.length - 24} more positions</small> : null}
                      <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700 }}>OPEN EQUIPMENT →</div>
                    </Link>
                  ) : (
                    <div style={{ padding: '16px 0', color: '#64748b', fontSize: 12 }}>
                      AVAILABLE
                      {canWrite && isActive ? <button type="button" onClick={() => openComposer(index)} style={{ display: 'block', marginTop: 8 }}>+ ADD EQUIPMENT</button> : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : <p>No child Equipment installed.</p>}
      </section>
      {showPositionEditor ? (
      {showFullComposition && visibleCount > 4 ? <button type="button" onClick={() => setShowFullComposition(false)}>BACK TO SUMMARY</button> : null}
      {summary ? (
        <div className="equipment-slot-grid">
          <article className="equipment-slot"><strong>{equipment.children.filter(Boolean).length} occupied / {visibleCount} positions</strong><p>Large compositions open in summary mode to keep the workspace usable.</p><button type="button" onClick={() => setShowFullComposition(true)}>EXPLORE POSITIONS</button></article>
        </div>
      ) : equipment.childMode === 'POSITIONAL' ? (
        <div className="equipment-slot-grid" style={compositionStyle}>
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
                ) : canWrite && isActive ? (
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
          {canWrite && isActive ? (
            <button type="button" onClick={() => openComposer(null)}>
              + ADD EQUIPMENT
            </button>
          ) : null}
        </div>
      )}

      ) : null}

      {isActive && composerOpen ? (
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
                  onChange={(event) => { setTemplateId(event.target.value); setWarehouseChildMode(''); setWarehouseChildCapacity(''); }}
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
                <select name="childMode" value={warehouseChildMode} onChange={(event) => { setWarehouseChildMode(event.target.value); setWarehouseChildCapacity(''); }}>
                  <option value="">Use template</option>
                  <option value="DYNAMIC">Dynamic</option>
                  <option value="POSITIONAL">Positional</option>
                </select>
              </label>
              <label>
                Child slots override
                <input name="childCapacity" type="number" min="1" max="256" value={warehouseChildCapacity} disabled={(warehouseChildMode || selectedTemplate?.childMode || 'DYNAMIC') !== 'POSITIONAL'} placeholder={(warehouseChildMode || selectedTemplate?.childMode || 'DYNAMIC') === 'DYNAMIC' ? 'Not applicable (leaf / dynamic)' : String(selectedTemplate?.childCapacity ?? '1–256')} onChange={(event) => setWarehouseChildCapacity(event.target.value)} />
              </label>
              <label>
                Serial number
                <input name="serialNumber" maxLength={120} />
              </label>
              <label>
                Category override
                <input name="category" maxLength={120} />
              </label>
              {presentationFields(selectedTemplate?.presentation)}
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
                  onChange={(event) => setOneOffChildMode(event.target.value as EquipmentChildMode)}
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
              {presentationFields()}
              <button type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create and install'}
              </button>
            </form>
          )}

          {error ? <p role="alert">{error}</p> : null}
        </div>
      ) : null}

      {!composerOpen && error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
