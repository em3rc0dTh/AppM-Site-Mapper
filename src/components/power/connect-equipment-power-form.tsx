'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export interface CommissioningPort {
  readonly id: string;
  readonly name: string;
  readonly equipmentId: string;
  readonly equipmentName: string;
  readonly deviceId: string;
  readonly direction: 'INPUT' | 'OUTPUT' | 'BIDIRECTIONAL';
  readonly feed?: 'A' | 'B';
  readonly connected?: boolean;
  readonly connectionLabel?: string;
  readonly pathId?: string;
}

export function ConnectEquipmentPowerForm({
  sources,
  targets,
  selectedSourceId,
  selectedTargetId,
  returnHref,
}: Readonly<{
  sources: readonly CommissioningPort[];
  targets: readonly CommissioningPort[];
  selectedSourceId?: string;
  selectedTargetId?: string;
  returnHref: string;
}>) {
  const t = useTranslations('connectEquipmentPower');
  const router = useRouter();
  const [sourceId, setSourceId] = useState(selectedSourceId ?? '');
  const [targetId, setTargetId] = useState(selectedTargetId ?? '');
  const [search, setSearch] = useState('');
  const [feed, setFeed] = useState<'A' | 'B'>('A');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const source = sources.find((port) => port.id === sourceId);
  const target = targets.find((port) => port.id === targetId);
  const chosenFeed = source?.feed ?? target?.feed ?? feed;
  const mismatch = Boolean(source?.feed && target?.feed && source.feed !== target.feed);
  const sourceAndTargetSameEquipment = Boolean(
    source && target && source.equipmentId === target.equipmentId,
  );
  const canConfirm = Boolean(
    source &&
    target &&
    !source.connected &&
    !target.connected &&
    !mismatch &&
    !sourceAndTargetSameEquipment &&
    !saving,
  );

  const filteredTargets = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return targets;
    return targets.filter((port) =>
      [port.equipmentName, port.name, port.id, port.deviceId].some((value) =>
        value.toLowerCase().includes(text),
      ),
    );
  }, [search, targets]);

  async function confirm() {
    if (!canConfirm || !source || !target) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/power-paths', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceAccessPortId: source.id,
          targetAccessPortId: target.id,
          feed: chosenFeed,
          ...(label.trim() ? { label: label.trim() } : {}),
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        path?: { id: string };
        error?: string;
      } | null;
      if (!response.ok || !result?.path?.id) {
        setError(result?.error ?? `CONNECT_FAILED_${response.status}`);
        return;
      }
      router.push(`/power?path=${encodeURIComponent(result.path.id)}&feed=${chosenFeed}`);
      router.refresh();
    } catch {
      setError('NETWORK_ERROR: Connection could not be confirmed. Nothing was recorded.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="power-port-connect-page">
      <header className="power-port-connect-header">
        <div>
          <small>{t('physicalCommissioning')}</small>
          <h1>{t('title')}</h1>
          <p>{t('intro')}</p>
        </div>
        <Link href={returnHref}>{t('back')}</Link>
      </header>

      <div className="power-port-connect-columns">
        <section className="power-port-connect-panel">
          <h2>{t('source')}</h2>
          <p>{t('chooseSource')}</p>
          <label>
            Source Equipment / POWER OUTPUT
            <select
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value);
                setError('');
              }}
            >
              <option value="">{t('sourcePort')}</option>
              {sources.map((port) => (
                <option key={port.id} value={port.id} disabled={port.connected}>
                  {port.equipmentName} / {port.name}
                  {port.feed ? ` · Feed ${port.feed}` : ''}
                  {port.connected ? ' · ALREADY CONNECTED' : ''}
                </option>
              ))}
            </select>
          </label>
          {source && (
            <div className="power-port-connect-preview">
              <small>{t('selectedSource')}</small>
              <strong>{source.equipmentName}</strong>
              <span>
                {source.name} · {source.direction}
              </span>
              {source.connected && (
                <strong role="status">
                  {t('sourceConnected')} {source.connectionLabel}
                </strong>
              )}
            </div>
          )}
        </section>

        <section className="power-port-connect-panel">
          <h2>{t('destination')}</h2>
          <p>{t('chooseTarget')}</p>
          <label>
            Search destination Equipment
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('destinationPlaceholder')}
            />
          </label>
          <label>
            Destination Equipment / POWER INPUT
            <select
              value={targetId}
              onChange={(event) => {
                setTargetId(event.target.value);
                setError('');
              }}
            >
              <option value="">{t('destinationPort')}</option>
              {filteredTargets.map((port) => (
                <option key={port.id} value={port.id} disabled={port.connected}>
                  {port.equipmentName} / {port.name}
                  {port.feed ? ` · Feed ${port.feed}` : ''}
                  {port.connected ? ' · ALREADY CONNECTED' : ''}
                </option>
              ))}
              {target && !filteredTargets.some((port) => port.id === target.id) && (
                <option value={target.id}>
                  {target.equipmentName} / {target.name}
                </option>
              )}
            </select>
          </label>
          {target && (
            <div className="power-port-connect-preview">
              <small>{t('selectedDestination')}</small>
              <strong>{target.equipmentName}</strong>
              <span>
                {target.name} · {target.direction}
              </span>
              {target.connected && (
                <strong role="status">
                  {t('poweredBy')} {target.connectionLabel}
                </strong>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="power-port-connect-review">
        <h2>{t('verify')}</h2>
        <div className="power-port-connect-path">
          <strong>{source ? `${source.equipmentName} / ${source.name}` : t('selectSource')}</strong>
          <span aria-hidden="true">→</span>
          <strong>
            {target ? `${target.equipmentName} / ${target.name}` : 'Select destination'}
          </strong>
        </div>
        <div className="power-port-connect-fields">
          <label>
            Electrical feed
            <select
              value={chosenFeed}
              disabled={Boolean(source?.feed || target?.feed)}
              onChange={(event) => setFeed(event.target.value as 'A' | 'B')}
            >
              <option value="A">{t('feedA')}</option>
              <option value="B">{t('feedB')}</option>
            </select>
          </label>
          <label>
            Connection label (optional)
            <input
              value={label}
              maxLength={120}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t('connectionPlaceholder')}
            />
          </label>
        </div>
        {sourceAndTargetSameEquipment && <p role="alert">{t('notSame')}</p>}
        {source?.connected && (
          <p role="alert">
            SOURCE_ALREADY_CONNECTED: This POWER output already feeds {source.connectionLabel}.
            Disconnect the recorded path before allocating this terminal elsewhere.
            {source.pathId && (
              <Link href={`/power?path=${encodeURIComponent(source.pathId)}`}>
                {' '}
                {t('viewPath')}
              </Link>
            )}
          </p>
        )}
        {target?.connected && (
          <p role="alert">
            TARGET_ALREADY_CONNECTED: This POWER input already has a connection.
            {target.pathId && (
              <Link href={`/power?path=${encodeURIComponent(target.pathId)}`}>
                {' '}
                {t('viewPath')}
              </Link>
            )}
          </p>
        )}
        {mismatch && <p role="alert">{t('mismatch')}</p>}
        {error && <p role="alert">{error}</p>}
        <p className="power-port-connect-caution">{t('caution')}</p>
        <div className="power-port-connect-actions">
          <Link href={returnHref}>{t('cancel')}</Link>
          <button type="button" disabled={!canConfirm} onClick={() => void confirm()}>
            {saving ? t('confirming') : t('confirm')}
          </button>
        </div>
      </section>
    </main>
  );
}
