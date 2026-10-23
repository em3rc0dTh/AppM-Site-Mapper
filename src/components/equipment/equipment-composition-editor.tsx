'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PhysicalEquipmentDiagram } from './physical-equipment-diagram';
import { PanelCommissioning } from '@/components/telemetry/panel-commissioning';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import type {
  EquipmentChildMode,
  EquipmentNode,
  EquipmentType,
} from '@/modules/topology/domain/entities';
import { EQUIPMENT_TYPES } from '@/modules/topology/domain/type-parsers';
import { allowedChildEquipmentTypes, canInstallChildType } from './allowed-child-equipment-types';
import type { AssetTemplate } from '@/modules/warehouse/domain/template';
import type { CompositionBreakerBinding } from '@/modules/telemetry/domain/composition-breaker-telemetry';
import type { PortConnectionView } from '@/modules/power/domain/port-connection-view';

function label(type: EquipmentType): string {
  return type.replaceAll('_', ' ');
}

export function EquipmentCompositionEditor({
  equipment,
  childEquipment,
  familyEquipment,
  canWrite,
  canWritePower,
  canReadTelemetry = false,
  breakerTelemetryBindings = [],
  portConnections = [],
}: Readonly<{
  equipment: EquipmentNode;
  childEquipment: readonly EquipmentNode[];
  familyEquipment: readonly EquipmentNode[];
  canWrite: boolean;
  canWritePower: boolean;
  canReadTelemetry?: boolean;
  breakerTelemetryBindings?: readonly CompositionBreakerBinding[];
  portConnections?: readonly PortConnectionView[];
}>) {
  const t = useTranslations('equipmentEditor');
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
  const [layoutDirection, setLayoutDirection] = useState<'ROW' | 'COLUMN'>(
    equipment.presentation?.direction ?? 'ROW',
  );
  const [maxPerLine, setMaxPerLine] = useState(
    equipment.presentation?.maxPerLine?.toString() ?? 'auto',
  );
  const [childrenVisibility, setChildrenVisibility] = useState<'AUTO' | 'INLINE' | 'SUMMARY'>(
    equipment.presentation?.childrenVisibility ?? 'AUTO',
  );
  const [targetSlot, setTargetSlot] = useState<number | null>(null);
  const [mode, setMode] = useState<'warehouse' | 'one-off'>('warehouse');
  const [warehouseChildMode, setWarehouseChildMode] = useState<EquipmentChildMode>('DYNAMIC');
  const [warehouseChildCapacity, setWarehouseChildCapacity] = useState('');
  const [oneOffChildMode, setOneOffChildMode] = useState<EquipmentChildMode>('DYNAMIC');
  const [templates, setTemplates] = useState<readonly AssetTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const allowed = equipment.template?.allowedChildTypes ?? [];
  const permissibleChildTypes = allowedChildEquipmentTypes(allowed);
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
      maxPerLine:
        form.get('presentationMaxPerLine') === 'auto'
          ? null
          : Number(form.get('presentationMaxPerLine') ?? 2),
      childrenVisibility: String(form.get('presentationVisibility') ?? 'AUTO') as
        'AUTO' | 'INLINE' | 'SUMMARY',
    };
  }

  function presentationFields() {
    return (
      <fieldset>
        <legend>{t('layout')}</legend>
        <label>
          Layout direction
          <select key="instance-direction" name="presentationDirection" defaultValue="ROW">
            <option value="ROW">{t('row')}</option>
            <option value="COLUMN">{t('column')}</option>
          </select>
        </label>
        <label>
          Max items per line
          <select key="instance-max" name="presentationMaxPerLine" defaultValue="auto">
            <option value="auto">{t('auto')}</option>
            {Array.from({ length: 256 }, (_, index) => index + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Child display
          <select key="instance-visibility" name="presentationVisibility" defaultValue="AUTO">
            <option value="AUTO">{t('auto')}</option>
            <option value="INLINE">{t('inline')}</option>
            <option value="SUMMARY">{t('summary')}</option>
          </select>
        </label>
      </fieldset>
    );
  }

  function telemetryPrefixField(defaultValue = '') {
    return (
      <label>
        MQTT point prefix · Panel/group
        <input
          name="telemetryPointPrefix"
          defaultValue={defaultValue}
          maxLength={80}
          pattern="[A-Za-z0-9]+(_[A-Za-z0-9]+)*"
          placeholder="e.g. 0_2"
          title={t('rawMqtt')}
        />
        <small>
          Point 1 becomes prefix_1. This records the address only; it does not reassign existing
          circuit bindings or prove their physical wiring.
        </small>
      </label>
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
          telemetryPointPrefix: String(form.get('telemetryPointPrefix') ?? ''),
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
    const typeOverride = String(form.get('equipmentType') ?? '');
    const effectiveType = typeOverride || selectedTemplate?.equipmentType || 'CUSTOM';
    if (!canInstallChildType(allowed, effectiveType as EquipmentType)) {
      setError(
        `INCOMPATIBLE_CHILD_TYPE: The parent accepts only ${allowed.map(label).join(', ')}. ` +
          `You selected ${effectiveType.replaceAll('_', ' ')}.`,
      );
      return;
    }
    const resolvedMode = warehouseChildMode;
    const resolvedCapacity = warehouseChildCapacity.trim()
      ? Number(warehouseChildCapacity)
      : undefined;
    if (
      resolvedMode === 'POSITIONAL' &&
      (!Number.isInteger(resolvedCapacity) || (resolvedCapacity ?? 0) < 1)
    ) {
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
          childMode: warehouseChildMode,
          childCapacity: resolvedMode === 'POSITIONAL' ? resolvedCapacity : undefined,
          telemetryPointPrefix: String(form.get('telemetryPointPrefix') ?? ''),
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
    const type = String(form.get('equipmentType') ?? 'CUSTOM') as EquipmentType;
    if (!canInstallChildType(allowed, type)) {
      setError(`INCOMPATIBLE_CHILD_TYPE: This parent accepts ${allowed.map(label).join(', ')}.`);
      return;
    }
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
          telemetryPointPrefix: String(form.get('telemetryPointPrefix') ?? ''),
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
  const summary =
    !showFullComposition &&
    visibleCount > 4 &&
    (displayPolicy === 'AUTO' || displayPolicy === 'SUMMARY');
  const lineLimit = equipment.presentation?.maxPerLine ?? visibleCount;
  const itemCount = Math.max(1, Math.min(visibleCount || 1, lineLimit));
  const compositionStyle = {
    display: 'grid',
    gridTemplateColumns:
      equipment.presentation?.direction === 'COLUMN'
        ? 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))'
        : `repeat(${itemCount}, minmax(0, 1fr))`,
    gridAutoFlow: equipment.presentation?.direction === 'COLUMN' ? 'column' : 'row',
    ...(equipment.presentation?.direction === 'COLUMN'
      ? { gridTemplateRows: `repeat(${itemCount}, auto)` }
      : {}),
    maxWidth: '100%',
  };
  return (
    <section className="equipment-composition">
      <header className="equipment-composition-header">
        <div>
          <span>{t('physical')}</span>
          <h2>{equipment.name}</h2>
          <small>
            {label(equipment.equipmentType)} · {equipment.lifecycle} · {equipment.childMode}
            {equipment.childMode === 'POSITIONAL'
              ? ' · ' + t('slotsCount', { count: equipment.children.length })
              : ' · ' + t('childrenCount', { count: equipment.children.length })}
            {equipment.telemetryPointPrefix ? ' · MQTT ' + equipment.telemetryPointPrefix : ''}
          </small>
        </div>
        <div className="equipment-composition-policy">
          {allowed.length ? (
            <p>{t('allowed', { types: allowed.map(label).join(', ') })}</p>
          ) : (
            <p>{t('anyType')}</p>
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
                    {t('configure')}
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    disabled={busy || !canArchive}
                    title={
                      canArchive
                        ? t('archiveTitle')
                        : equipment.parentEquipmentId !== null
                          ? t('detachFirst')
                          : equipment.rackPlacement
                            ? t('releaseFirst')
                            : t('removeChildren')
                    }
                    onClick={() => void changeLifecycle('archive')}
                  >
                    {t('archive')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="is-restore"
                  disabled={busy}
                  onClick={() => void changeLifecycle('restore')}
                >
                  {t('restore')}
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
              <option value="DYNAMIC">{t('dynamic')}</option>
              <option value="POSITIONAL">{t('positional')}</option>
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
          {configurationMode === 'POSITIONAL'
            ? telemetryPrefixField(equipment.telemetryPointPrefix ?? '')
            : null}
          <label>
            Layout direction
            <select
              value={layoutDirection}
              onChange={(event) => setLayoutDirection(event.target.value as 'ROW' | 'COLUMN')}
            >
              <option value="ROW">{t('row')}</option>
              <option value="COLUMN">{t('column')}</option>
            </select>
          </label>
          <label>
            Max items per {layoutDirection === 'ROW' ? 'row' : 'column'}
            <select value={maxPerLine} onChange={(event) => setMaxPerLine(event.target.value)}>
              <option value="auto">{t('auto')}</option>
              {Array.from({ length: 256 }, (_, index) => index + 1).map((amount) => (
                <option key={amount} value={amount}>
                  {amount}
                </option>
              ))}
            </select>
          </label>
          <label>
            Child display
            <select
              value={childrenVisibility}
              onChange={(event) =>
                setChildrenVisibility(event.target.value as 'AUTO' | 'INLINE' | 'SUMMARY')
              }
            >
              <option value="AUTO">{t('auto')}</option>
              <option value="INLINE">{t('inline')}</option>
              <option value="SUMMARY">{t('summary')}</option>
            </select>
          </label>
          <button type="submit" disabled={busy}>
            {busy ? t('saving') : t('save')}
          </button>
        </form>
      ) : null}

      <PhysicalEquipmentDiagram
        root={equipment}
        equipment={familyEquipment}
        canWritePower={canWritePower}
        canReadTelemetry={canReadTelemetry}
        breakerTelemetryBindings={breakerTelemetryBindings}
        portConnections={portConnections}
        onAdd={canWrite && isActive ? openComposer : undefined}
      />
      {canReadTelemetry &&
      equipment.equipmentType === 'PANEL' &&
      equipment.childMode === 'POSITIONAL' &&
      equipment.telemetryPointPrefix &&
      equipment.serialNumber ? (
        <PanelCommissioning panelId={equipment.id} canWrite={canWrite} />
      ) : null}
      <div className="equipment-composition-workbench-actions">
        {canWrite && isActive && equipment.childMode === 'DYNAMIC' && (
          <button type="button" onClick={() => openComposer(null)}>
            {t('add')}
          </button>
        )}
        <button type="button" onClick={() => setShowPositionEditor((value) => !value)}>
          {equipment.childMode === 'POSITIONAL'
            ? showPositionEditor
              ? t('hidePosition')
              : t('managePosition')
            : showPositionEditor
              ? t('hideChildren')
              : t('manageChildren')}
        </button>
      </div>
      {showPositionEditor ? (
        <>
          {showFullComposition && visibleCount > 4 ? (
            <button type="button" onClick={() => setShowFullComposition(false)}>
              {t('back')}
            </button>
          ) : null}
          {summary ? (
            <div className="equipment-slot-grid">
              <article className="equipment-slot">
                <strong>
                  {t('occupied', {
                    occupied: equipment.children.filter(Boolean).length,
                    total: visibleCount,
                  })}
                </strong>
                <p>{t('large')}</p>
                <button type="button" onClick={() => setShowFullComposition(true)}>
                  {t('explore')}
                </button>
              </article>
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
                      <span>{t('position', { position: String(index + 1).padStart(2, '0') })}</span>
                      <b>{childId ? t('occupiedStatus') : t('available')}</b>
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
                                aria-label={t('moveToSlot', { name: child.name })}
                                defaultValue=""
                                disabled={busy}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  if (value) void moveChild(child.id, Number(value));
                                  event.currentTarget.value = '';
                                }}
                              >
                                <option value="">{t('moveTo')}</option>
                                {availableSlots.map((slot) => (
                                  <option key={slot} value={slot}>
                                    {t('positionOption', {
                                      position: String(slot + 1).padStart(2, '0'),
                                    })}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void detachChild(child.id)}
                            >
                              {t('detach')}
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : childId ? (
                      <div className="equipment-slot-missing">
                        <strong>{t('reference')}</strong>
                        <small>{childId}</small>
                      </div>
                    ) : canWrite && isActive ? (
                      <button type="button" onClick={() => openComposer(index)}>
                        {t('add')}
                      </button>
                    ) : (
                      <span>{t('empty')}</span>
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
                          {t('detach')}
                        </button>
                      ) : null}
                    </article>
                  ) : (
                    <article key={childId} className="equipment-slot-missing">
                      <strong>{t('reference')}</strong>
                      <small>{childId}</small>
                    </article>
                  );
                })
              ) : (
                <p>{t('none')}</p>
              )}
              {canWrite && isActive ? (
                <button type="button" onClick={() => openComposer(null)}>
                  {t('add')}
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {isActive && composerOpen ? (
        <div className="equipment-composer">
          <header>
            <div>
              <strong>
                {t('addChild')}
                {targetSlot === null
                  ? ''
                  : t('positionSuffix', { position: String(targetSlot + 1).padStart(2, '0') })}
              </strong>
              <small>{t('parent', { name: equipment.name })}</small>
            </div>
            <button type="button" onClick={() => setComposerOpen(false)} aria-label={t('close')}>
              ×
            </button>
          </header>

          <div className="equipment-composer-tabs">
            <button
              type="button"
              className={mode === 'warehouse' ? 'is-active' : undefined}
              onClick={() => setMode('warehouse')}
            >
              {t('warehouse')}
            </button>
            <button
              type="button"
              className={mode === 'one-off' ? 'is-active' : undefined}
              onClick={() => setMode('one-off')}
            >
              {t('oneOff')}
            </button>
          </div>

          {mode === 'warehouse' ? (
            <form onSubmit={createFromWarehouse}>
              <label>
                Equipment template
                <select
                  value={templateId}
                  onChange={(event) => {
                    setTemplateId(event.target.value);
                    setWarehouseChildMode('DYNAMIC');
                    setWarehouseChildCapacity('');
                  }}
                  disabled={loadingTemplates}
                  required
                >
                  {!templates.length ? (
                    <option value="">{loadingTemplates ? t('loading') : t('noTemplates')}</option>
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
                    {selectedTemplate.equipmentType ?? 'CUSTOM'} · Choose child slots and
                    presentation for this instance
                  </span>
                </div>
              ) : null}
              <label>
                Instance name
                <input
                  name="name"
                  maxLength={120}
                  placeholder={selectedTemplate?.name ?? t('equipmentName')}
                />
              </label>
              {allowed.length > 0 ? (
                <p className="equipment-child-type-notice">
                  This {label(equipment.equipmentType)} accepts only{' '}
                  <strong>{allowed.map(label).join(', ')}</strong> children. Install the allowed
                  Equipment first; add its own children inside that Equipment.
                </p>
              ) : null}
              <label>
                Equipment type override
                <select
                  key={templateId + ':' + defaultWarehouseType}
                  name="equipmentType"
                  defaultValue={defaultWarehouseType}
                >
                  <option value="">
                    Use template ({selectedTemplate?.equipmentType ?? 'CUSTOM'})
                  </option>
                  {permissibleChildTypes.map((type) => (
                    <option key={type} value={type}>
                      {label(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Children mode · This instance
                <select
                  name="childMode"
                  value={warehouseChildMode}
                  onChange={(event) => {
                    setWarehouseChildMode(event.target.value as EquipmentChildMode);
                    setWarehouseChildCapacity('');
                  }}
                >
                  <option value="DYNAMIC">{t('dynamic')}</option>
                  <option value="POSITIONAL">{t('positionalShort')}</option>
                </select>
              </label>
              {warehouseChildMode === 'POSITIONAL' ? (
                <label>
                  {t('slotsInstance')}
                  <input
                    name="childCapacity"
                    type="number"
                    min="1"
                    max="256"
                    required
                    value={warehouseChildCapacity}
                    placeholder={t('slotsPlaceholder')}
                    onChange={(event) => setWarehouseChildCapacity(event.target.value)}
                  />
                </label>
              ) : null}
              {warehouseChildMode === 'POSITIONAL' ? telemetryPrefixField() : null}
              <label>
                Serial number
                <input name="serialNumber" maxLength={120} />
              </label>
              <label>
                Category override
                <input name="category" maxLength={120} />
              </label>
              {presentationFields()}
              <button type="submit" disabled={busy || !templateId}>
                {busy ? t('creating') : t('install')}
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
                  {permissibleChildTypes.map((type) => (
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
                  <option value="DYNAMIC">{t('dynamic')}</option>
                  <option value="POSITIONAL">{t('positionalShort')}</option>
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
                    placeholder={t('positionsPlaceholder')}
                  />
                </label>
              ) : null}
              {oneOffChildMode === 'POSITIONAL' ? telemetryPrefixField() : null}
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
                {busy ? t('creating') : t('create')}
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
