'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  DeletionMode,
  DeletionPreview,
} from '@/modules/topology/application/topology-deletion-service';

const errorKeys = {
  PREVIEW_FAILED: 'errors.previewFailed',
  DELETE_FAILED: 'errors.deleteFailed',
  SESSION_INVALID: 'errors.forbidden',
  FORBIDDEN: 'errors.forbidden',
  INVALID_ORIGIN: 'errors.forbidden',
  CROSS_SITE_MUTATION_REJECTED: 'errors.forbidden',
  INVALID_REQUEST: 'errors.invalidRequest',
  INVALID_MODE: 'errors.invalidRequest',
  ENTITY_NOT_ACTIVE: 'errors.entityNotActive',
  INVALID_TOPOLOGY_CYCLE: 'errors.invalidTopologyCycle',
  DELETION_TOO_LARGE: 'errors.deletionTooLarge',
  DELETE_TOO_MANY_REFERENCES: 'errors.referenceLimit',
  INVALID_PHYSICAL_REFERENCE: 'errors.invalidPhysicalReference',
  RACK_CONTAINS_EXTERNAL_OCCUPANT: 'errors.externalRackOccupant',
  CAS_REFERENCE_CONFLICT: 'errors.casConflict',
  DELETE_NAME_MISMATCH: 'errors.nameMismatch',
  DELETE_PREVIEW_STALE: 'errors.stalePreview',
  HAS_ACTIVE_CHILDREN: 'errors.activeChildren',
  DELETE_OWNING_DEVICE_INSTEAD: 'errors.deleteOwningDevice',
  ATOMIC_DELETION_REQUIRED: 'errors.atomicDeletionRequired',
  DELETE_LAYOUT_CONFLICT: 'errors.layoutConflict',
  LAYOUT_CONFLICT: 'errors.layoutConflict',
  WRITES_PAUSED_FOR_MIGRATION: 'errors.writesPaused',
  ACTIVE_POWER_PATHS: 'errors.dependencyConflict',
  ACTIVE_TELEMETRY_BINDINGS: 'errors.dependencyConflict',
  ACTIVE_ACCESS_PORTS: 'errors.dependencyConflict',
  ACTIVE_REFERENCE_CONFLICT: 'errors.dependencyConflict',
  COMMISSIONING_TOPOLOGY_CONFLICT: 'errors.dependencyConflict',
  BINDING_CONFLICT: 'errors.bindingConflict',
  STALE_BINDING: 'errors.bindingConflict',
} as const;

export function DeleteEntityControl({ id, name }: Readonly<{ id: string; name: string }>) {
  const t = useTranslations('topologyDeletion');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DeletionMode>('SINGLE');
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [typedName, setTypedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function localizedError(code: string) {
    const key = Object.hasOwn(errorKeys, code)
      ? errorKeys[code as keyof typeof errorKeys]
      : 'errors.generic';
    return t(key);
  }

  async function load(nextMode: DeletionMode) {
    setMode(nextMode);
    setPreview(null);
    setTypedName('');
    setError('');
    setBusy(true);
    try {
      const response = await fetch(
        '/api/topology/' + encodeURIComponent(id) + '/delete?mode=' + nextMode,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as { preview?: DeletionPreview; error?: string };
      if (!response.ok || !payload.preview) throw new Error(payload.error ?? 'PREVIEW_FAILED');
      setPreview(payload.preview);
    } catch (cause) {
      setError(localizedError(cause instanceof Error ? cause.message : 'PREVIEW_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!preview || typedName !== name || (mode === 'SINGLE' && preview.hasChildren)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/topology/' + encodeURIComponent(id) + '/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, name: typedName, token: preview.token }),
      });
      const result = (await response.json()) as { operationId?: string; error?: string };
      if (!response.ok) {
        // A changed topology or placement requires a fresh user review.
        setPreview(null);
        throw new Error(result.error ?? 'DELETE_FAILED');
      }
      setSuccess(result.operationId ?? '');
      setOpen(false);
      router.replace('/workspace');
      router.refresh();
    } catch (cause) {
      setError(localizedError(cause instanceof Error ? cause.message : 'DELETE_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mk1-delete-entity">
      <button
        type="button"
        className="is-danger"
        onClick={() => {
          setOpen(true);
          void load('SINGLE');
        }}
      >
        {t('delete')}
      </button>
      {success ? <span role="status">{t('audited', { operationId: success })}</span> : null}
      {open ? (
        <section
          role="dialog"
          aria-modal="true"
          aria-label={t('dialogTitle', { name })}
          className="mk1-delete-dialog"
          style={{
            padding: 20,
            border: '2px solid currentColor',
            borderRadius: 12,
            maxWidth: 460,
            background: 'var(--background, #fff)',
            color: 'var(--foreground, #111)',
            position: 'relative',
            zIndex: 20,
          }}
        >
          <h3>{t('dialogTitle', { name })}</h3>
          <p>{t('description')}</p>
          <fieldset disabled={busy}>
            <legend>{t('scope')}</legend>
            <label>
              <input
                type="radio"
                name={'delete-mode-' + id}
                checked={mode === 'SINGLE'}
                onChange={() => void load('SINGLE')}
              />{' '}
              {t('single')}
            </label>
            <label style={{ display: 'block' }}>
              <input
                type="radio"
                name={'delete-mode-' + id}
                checked={mode === 'TREE'}
                onChange={() => void load('TREE')}
              />{' '}
              {t('tree')}
            </label>
          </fieldset>
          {preview ? (
            <div aria-live="polite">
              <p>
                {t('impactEntities', {
                  totalNodes: preview.totalNodes,
                  deviceCount: preview.deviceCount,
                  equipmentCount: preview.equipmentCount,
                })}
              </p>
              <p>
                {t('impactReferences', {
                  occupiedCasCount: preview.occupiedCasCount,
                  powerPathCount: preview.powerPathCount,
                  bindingCount: preview.bindingCount,
                })}
              </p>
              {mode === 'SINGLE' && preview.hasChildren ? (
                <p role="alert">{t('hasChildren')}</p>
              ) : null}
              <label style={{ display: 'block' }}>
                {t('confirmNamePrompt')} <strong>{name}</strong>
                <input
                  autoComplete="off"
                  spellCheck={false}
                  value={typedName}
                  onChange={(event) => setTypedName(event.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 8 }}
                  aria-label={t('nameInput')}
                />
              </label>
            </div>
          ) : null}
          {error ? (
            <p role="alert">
              {error} {t('refreshAfterError')}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTypedName('');
                setPreview(null);
              }}
              disabled={busy}
            >
              {t('cancel')}
            </button>
            <button type="button" onClick={() => void load(mode)} disabled={busy}>
              {t('refreshPreview')}
            </button>
            <button
              type="button"
              className="is-danger"
              onClick={() => void remove()}
              disabled={
                busy || !preview || typedName !== name ||
                (mode === 'SINGLE' && preview.hasChildren)
              }
            >
              {busy ? t('processing') : t('confirmDelete')}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
