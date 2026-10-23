'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type {
  PowerContractPortInput,
  PowerRedundancyPolicy,
} from '@/modules/inventory/application/power-contract-service';

interface EditablePort {
  readonly key: string;
  readonly id: string;
  readonly label: string;
  readonly feed: '' | 'A' | 'B';
}

function toEditable(port: PowerContractPortInput): EditablePort {
  return {
    key: port.id,
    id: port.id,
    label: port.label,
    feed: port.feed ?? '',
  };
}

export function PowerContractEditor({
  entityId,
  accessPorts,
  redundancy,
}: Readonly<{
  entityId: string;
  accessPorts: readonly PowerContractPortInput[];
  redundancy: PowerRedundancyPolicy;
}>) {
  const t = useTranslations('powerContract');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ports, setPorts] = useState<readonly EditablePort[]>(accessPorts.map(toEditable));
  const [policy, setPolicy] = useState<PowerRedundancyPolicy>(redundancy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = useMemo(
    () => ports.every((port) => port.id.trim() && port.label.trim()) && !saving,
    [ports, saving],
  );

  function addPort() {
    const seed =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : String(Date.now());
    setPorts((current) => [
      ...current,
      { key: seed, id: `power-${seed}`, label: 'Power input', feed: '' },
    ]);
  }

  function patchPort(key: string, patch: Partial<EditablePort>) {
    setPorts((current) => current.map((port) => (port.key === key ? { ...port, ...patch } : port)));
  }

  function removePort(key: string) {
    setPorts((current) => current.filter((port) => port.key !== key));
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/inventory/${encodeURIComponent(entityId)}/power-contract`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            redundancy: policy,
            accessPorts: ports.map((port) => ({
              id: port.id.trim(),
              label: port.label.trim(),
              ...(port.feed ? { feed: port.feed } : {}),
            })),
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as {
        item?: unknown;
        error?: string;
      } | null;
      if (!response.ok || !payload?.item) {
        setError(payload?.error ?? `Unable to save power ports (HTTP ${response.status}).`);
        return;
      }

      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="zip-device-outline" onClick={() => setOpen(true)}>
        {t('powerPortsButton')}
      </button>

      {open ? (
        <div
          className="power-contract-backdrop"
          role="presentation"
          onMouseDown={() => setOpen(false)}
        >
          <section
            className="power-contract-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="power-contract-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>{t('header')}</small>
                <h2 id="power-contract-title">{t('title')}</h2>
                <p>{t('declaredRedundancy')}</p>
              </div>
              <button type="button" aria-label={t('close')} onClick={() => setOpen(false)}>
                ×
              </button>
            </header>

            <label className="power-contract-policy">
              <span>{t('redundancy')}</span>
              <select
                value={policy}
                onChange={(event) => setPolicy(event.target.value as PowerRedundancyPolicy)}
              >
                <option value="NONE">{t('none')}</option>
                <option value="A_B_REQUIRED">{t('required')}</option>
              </select>
            </label>

            <div className="power-contract-port-list">
              {ports.map((port, index) => (
                <article key={port.key} className="power-contract-port-row">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <label>
                    <small>{t('portId')}</small>
                    <input
                      value={port.id}
                      onChange={(event) => patchPort(port.key, { id: event.target.value })}
                    />
                  </label>
                  <label>
                    <small>{t('label')}</small>
                    <input
                      value={port.label}
                      onChange={(event) => patchPort(port.key, { label: event.target.value })}
                    />
                  </label>
                  <label>
                    <small>{t('feed')}</small>
                    <select
                      value={port.feed}
                      onChange={(event) =>
                        patchPort(port.key, { feed: event.target.value as '' | 'A' | 'B' })
                      }
                    >
                      <option value="">{t('unspecified')}</option>
                      <option value="A">{t('feedA')}</option>
                      <option value="B">{t('feedB')}</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label={t('removePort', { name: port.label })}
                    onClick={() => removePort(port.key)}
                  >
                    {t('remove')}
                  </button>
                </article>
              ))}
              {!ports.length ? <div className="power-contract-empty">{t('empty')}</div> : null}
            </div>

            <button type="button" className="power-contract-add" onClick={addPort}>
              {t('add')}
            </button>

            {error ? <p className="power-contract-error">{error}</p> : null}

            <footer>
              <button type="button" onClick={() => setOpen(false)}>
                {t('cancel')}
              </button>
              <button type="button" disabled={!canSave} onClick={save}>
                {saving ? t('saving') : t('save')}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
