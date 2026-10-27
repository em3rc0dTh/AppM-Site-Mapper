'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DeletionMode, DeletionPreview } from '@/modules/topology/application/topology-deletion-service';

export function DeleteEntityControl({ id, name }: Readonly<{ id: string; name: string }>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DeletionMode>('SINGLE');
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [typedName, setTypedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
      setError(cause instanceof Error ? cause.message : 'PREVIEW_FAILED');
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
        // A changed tree or placement must always be reviewed again.
        setPreview(null);
        throw new Error(result.error ?? 'DELETE_FAILED');
      }
      setSuccess(result.operationId ?? 'RECORDED');
      setOpen(false);
      router.replace('/workspace');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'DELETE_FAILED');
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
        Delete
      </button>
      {success ? <span role="status">Operación auditada: {success}</span> : null}
      {open ? (
        <section
          role="dialog"
          aria-modal="true"
          aria-label={'Confirmar eliminación de ' + name}
          className="mk1-delete-dialog"
          style={{ padding: 20, border: '2px solid currentColor', borderRadius: 12, maxWidth: 460, background: 'var(--background, #fff)', color: 'var(--foreground, #111)', position: 'relative', zIndex: 20 }}
        >
          <h3>Eliminar {name}</h3>
          <p>
            La entidad dejará de estar disponible en el inventario operativo.
            Su identidad, registros archivados y mediciones históricas se conservarán.
          </p>
          <fieldset disabled={busy}>
            <legend>Alcance</legend>
            <label>
              <input
                type="radio"
                name={'delete-mode-' + id}
                checked={mode === 'SINGLE'}
                onChange={() => void load('SINGLE')}
              />{' '}
              Solo esta entidad (sin hijos)
            </label>
            <label style={{ display: 'block' }}>
              <input
                type="radio"
                name={'delete-mode-' + id}
                checked={mode === 'TREE'}
                onChange={() => void load('TREE')}
              />{' '}
              Entidad y todos sus descendientes
            </label>
          </fieldset>
          {preview ? (
            <div aria-live="polite">
              <p>
                <strong>{preview.totalNodes} entidades</strong> afectadas, entre ellas{' '}
                {preview.deviceCount} Device y {preview.equipmentCount} Equipment.
              </p>
              <p>
                {preview.occupiedCasCount} ocupaciones CAS, {preview.powerPathCount} rutas de
                energía y {preview.bindingCount} bindings operativos serán retirados.
              </p>
              {mode === 'SINGLE' && preview.hasChildren ? (
                <p role="alert">
                  Esta entidad contiene descendientes: elige la eliminación del árbol
                  completo o retíralos individualmente antes.
                </p>
              ) : null}
              <label style={{ display: 'block' }}>
                Para confirmar, escribe exactamente <strong>{name}</strong>:
                <input
                  autoComplete="off"
                  spellCheck={false}
                  value={typedName}
                  onChange={(event) => setTypedName(event.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 8 }}
                  aria-label="Nombre exacto de la entidad"
                />
              </label>
            </div>
          ) : null}
          {error ? <p role="alert">{error}. Actualiza la vista previa antes de confirmar.</p> : null}
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTypedName('');
                setPreview(null);
              }}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="is-danger"
              onClick={() => void remove()}
              disabled={busy || !preview || typedName !== name ||
                (mode === 'SINGLE' && preview.hasChildren)}
            >
              {busy ? 'Procesando…' : 'Confirmar eliminación'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
