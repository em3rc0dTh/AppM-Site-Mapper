'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { PowerTargetCatalogEntry } from '@/modules/power/domain/power-target-catalog';

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

type DestinationMode = 'CATALOG' | 'PHYSICAL';
type CatalogTab = 'EXISTING' | 'NEW';

type NewTargetDraft = {
  equipmentName: string;
  footprint: string;
  shelf: string;
  module: string;
  endpoint: string;
  displayLabel: string;
};

const EMPTY_TARGET: NewTargetDraft = {
  equipmentName: '',
  footprint: '',
  shelf: '',
  module: '',
  endpoint: '',
  displayLabel: '',
};

const CATALOG_PAGE_SIZE = 8;

export function ConnectEquipmentPowerForm({
  sources,
  targets,
  catalogTargets,
  selectedSourceId,
  selectedTargetId,
  returnHref,
}: Readonly<{
  sources: readonly CommissioningPort[];
  targets: readonly CommissioningPort[];
  catalogTargets: readonly PowerTargetCatalogEntry[];
  selectedSourceId?: string;
  selectedTargetId?: string;
  returnHref: string;
}>) {
  const t = useTranslations('connectEquipmentPower');
  const router = useRouter();
  const [sourceId, setSourceId] = useState(selectedSourceId ?? '');
  const [targetId, setTargetId] = useState(selectedTargetId ?? '');
  const [destinationMode, setDestinationMode] = useState<DestinationMode>('CATALOG');
  const [catalogTab, setCatalogTab] = useState<CatalogTab>('EXISTING');
  const [catalogRows, setCatalogRows] =
    useState<readonly PowerTargetCatalogEntry[]>(catalogTargets);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogPage, setCatalogPage] = useState(1);
  const [selectedCatalogKey, setSelectedCatalogKey] = useState('');
  const [physicalSearch, setPhysicalSearch] = useState('');
  const [newTarget, setNewTarget] = useState<NewTargetDraft>(EMPTY_TARGET);
  const [feed, setFeed] = useState<'A' | 'B'>('A');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingTarget, setCreatingTarget] = useState(false);
  const [error, setError] = useState('');

  const source = sources.find((port) => port.id === sourceId);
  const target = targets.find((port) => port.id === targetId);
  const selectedCatalog = catalogRows.find((item) => item.identityKey === selectedCatalogKey);
  const chosenFeed =
    source?.feed ?? (destinationMode === 'CATALOG' ? selectedCatalog?.feed : target?.feed) ?? feed;
  const physicalMismatch = Boolean(source?.feed && target?.feed && source.feed !== target.feed);
  const catalogMismatch = Boolean(
    source?.feed && selectedCatalog?.feed && source.feed !== selectedCatalog.feed,
  );
  const sourceAndTargetSameEquipment = Boolean(
    source && target && source.equipmentId === target.equipmentId,
  );

  const canConfirm =
    destinationMode === 'CATALOG'
      ? Boolean(source && selectedCatalog && !source.connected && !catalogMismatch && !saving)
      : Boolean(
          source &&
          target &&
          !source.connected &&
          !target.connected &&
          !physicalMismatch &&
          !sourceAndTargetSameEquipment &&
          !saving,
        );

  const filteredPhysicalTargets = useMemo(() => {
    const text = physicalSearch.trim().toLowerCase();
    if (!text) return targets;
    return targets.filter((port) =>
      [port.equipmentName, port.name, port.id, port.deviceId].some((value) =>
        value.toLowerCase().includes(text),
      ),
    );
  }, [physicalSearch, targets]);

  const filteredCatalog = useMemo(() => {
    const text = catalogSearch.trim().toLowerCase();
    if (!text) return catalogRows;
    return catalogRows.filter((item) =>
      [
        item.displayLabel,
        item.equipmentName,
        item.canonicalEquipmentName,
        item.footprint,
        item.rackAid,
        item.localAid,
        item.aid,
        item.shelf ?? '',
        item.module ?? '',
        item.endpoint ?? '',
      ].some((value) => value.toLowerCase().includes(text)),
    );
  }, [catalogRows, catalogSearch]);

  const pageCount = Math.max(1, Math.ceil(filteredCatalog.length / CATALOG_PAGE_SIZE));
  const safePage = Math.min(catalogPage, pageCount);
  const visibleCatalog = filteredCatalog.slice(
    (safePage - 1) * CATALOG_PAGE_SIZE,
    safePage * CATALOG_PAGE_SIZE,
  );

  function updateNewTarget<K extends keyof NewTargetDraft>(key: K, value: NewTargetDraft[K]) {
    setNewTarget((current) => ({ ...current, [key]: value }));
    setError('');
  }

  async function createCatalogTarget() {
    if (!newTarget.equipmentName.trim() || !newTarget.footprint.trim() || creatingTarget) return;
    setCreatingTarget(true);
    setError('');
    try {
      const response = await fetch('/api/power-targets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          equipmentName: newTarget.equipmentName.trim(),
          footprint: newTarget.footprint.trim(),
          shelf: newTarget.shelf.trim(),
          module: newTarget.module.trim(),
          endpoint: newTarget.endpoint.trim(),
          displayLabel: newTarget.displayLabel.trim(),
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        target?: PowerTargetCatalogEntry;
        error?: string;
      } | null;
      if (!response.ok || !result?.target) {
        setError(result?.error ?? `TARGET_CREATE_FAILED_${response.status}`);
        return;
      }
      setCatalogRows((current) => {
        const withoutSame = current.filter(
          (item) => item.identityKey !== result.target?.identityKey,
        );
        return [...withoutSame, result.target!].sort(
          (left, right) =>
            left.displayLabel.localeCompare(right.displayLabel) ||
            left.rackAid.localeCompare(right.rackAid),
        );
      });
      setSelectedCatalogKey(result.target.identityKey);
      setCatalogSearch(result.target.equipmentName);
      setCatalogPage(1);
      setCatalogTab('EXISTING');
      setNewTarget(EMPTY_TARGET);
    } catch {
      setError(t('networkError'));
    } finally {
      setCreatingTarget(false);
    }
  }

  async function confirm() {
    if (!canConfirm || !source) return;
    setSaving(true);
    setError('');

    try {
      if (destinationMode === 'CATALOG') {
        if (!selectedCatalog) return;
        const response = await fetch('/api/power-targets/assign', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sourceAccessPortId: source.id,
            targetIdentityKey: selectedCatalog.identityKey,
            feed: chosenFeed,
            ...(note.trim() ? { note: note.trim() } : {}),
          }),
        });
        const result = (await response.json().catch(() => null)) as {
          assignment?: { breakerId: string };
          error?: string;
        } | null;
        if (!response.ok || !result?.assignment?.breakerId) {
          setError(result?.error ?? `DECLARE_FAILED_${response.status}`);
          return;
        }
        router.push(
          `/workbench/powered-equipment?breakerId=${encodeURIComponent(result.assignment.breakerId)}`,
        );
        router.refresh();
        return;
      }

      if (!target) return;
      const response = await fetch('/api/power-paths', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceAccessPortId: source.id,
          targetAccessPortId: target.id,
          feed: chosenFeed,
          ...(note.trim() ? { label: note.trim() } : {}),
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
      setError(t('networkError'));
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
          <p>{t('introCatalog')}</p>
        </div>
        <Link href={returnHref}>{t('back')}</Link>
      </header>

      <div className="power-port-connect-columns power-port-connect-columns--catalog">
        <div className="power-port-connect-sidebar">
  
          <section className="power-port-connect-panel">
            <h2>{t('source')}</h2>
            <p>{t('chooseSource')}</p>
            <label>
              {t('sourceOutput')}
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
                    {port.feed ? t('feedLabel', { feed: port.feed }) : ''}
                    {port.connected ? t('alreadyConnected') : ''}
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
                {source.feed ? <span>{t('feedLabel', { feed: source.feed })}</span> : null}
                {source.connected && (
                  <strong role="status">
                    {t('sourceConnected')} {source.connectionLabel}
                  </strong>
                )}
              </div>
            )}
          </section>

        <section className="power-port-connect-review">
          <h2>{destinationMode === 'CATALOG' ? t('verifyDeclared') : t('verify')}</h2>
          <div className="power-port-connect-fields">
            <label>
              {t('electricalFeed')}
              <select
                value={chosenFeed}
                disabled={Boolean(
                  source?.feed ||
                  (destinationMode === 'CATALOG' ? selectedCatalog?.feed : target?.feed),
                )}
                onChange={(event) => setFeed(event.target.value as 'A' | 'B')}
              >
                <option value="A">{t('feedA')}</option>
                <option value="B">{t('feedB')}</option>
              </select>
            </label>
            <label>
              {t('connectionNoteOptional')}
              <input
                value={note}
                maxLength={240}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('connectionNotePlaceholder')}
              />
            </label>
          </div>
  
          {destinationMode === 'PHYSICAL' && sourceAndTargetSameEquipment ? (
            <p role="alert">{t('notSame')}</p>
          ) : null}
          {source?.connected ? (
            <p role="alert">
              {t('sourceAlreadyConnected', { label: source.connectionLabel ?? '' })}
              {source.pathId ? (
                <Link href={`/power?path=${encodeURIComponent(source.pathId)}`}>
                  {' '}
                  {t('viewPath')}
                </Link>
              ) : null}
            </p>
          ) : null}
          {destinationMode === 'PHYSICAL' && target?.connected ? (
            <p role="alert">
              {t('targetAlreadyConnected')}
              {target.pathId ? (
                <Link href={`/power?path=${encodeURIComponent(target.pathId)}`}>
                  {' '}
                  {t('viewPath')}
                </Link>
              ) : null}
            </p>
          ) : null}
          {(destinationMode === 'CATALOG' ? catalogMismatch : physicalMismatch) ? (
            <p role="alert">{t('mismatch')}</p>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
  
          <div className="power-port-connect-actions">
            <Link href={returnHref}>{t('cancel')}</Link>
            <button type="button" disabled={!canConfirm} onClick={() => void confirm()}>
              {saving
                ? t('confirming')
                : destinationMode === 'CATALOG'
                  ? t('confirmDeclared')
                  : t('confirm')}
            </button>
          </div>
        </section>
        </div>

        <section className="power-port-connect-panel power-target-panel">
          <div className="power-target-heading">
            <div>
              <h2>{t('destinationCatalog')}</h2>
              <p>{t('chooseCatalogTarget')}</p>
            </div>
            <span className="power-target-count">
              {t('catalogCount', { count: catalogRows.length })}
            </span>
          </div>

          {destinationMode === 'CATALOG' ? (
            <>
              <div className="power-target-tabs" role="group" aria-label={t('catalogMode')}>
                <button
                  type="button"
                  aria-pressed={catalogTab === 'EXISTING'}
                  onClick={() => setCatalogTab('EXISTING')}
                >
                  {t('existingTarget')}
                </button>
                <button
                  type="button"
                  aria-pressed={catalogTab === 'NEW'}
                  onClick={() => setCatalogTab('NEW')}
                >
                  + {t('newTarget')}
                </button>
              </div>

              {catalogTab === 'EXISTING' ? (
                <div className="power-target-catalog">
                  <label className="power-target-search">
                    {t('searchCatalog')}
                    <input
                      value={catalogSearch}
                      onChange={(event) => {
                        setCatalogSearch(event.target.value);
                        setCatalogPage(1);
                      }}
                      placeholder={t('catalogPlaceholder')}
                    />
                  </label>

                  <div className="power-target-table-wrap">
                    <table className="power-target-table">
                      <thead>
                        <tr>
                          <th aria-label={t('selectTarget')} />
                          <th>{t('displayTarget')}</th>
                          <th>{t('rackFootprint')}</th>
                          <th>{t('shelf')}</th>
                          <th>{t('moduleSlot')}</th>
                          <th>{t('endpoint')}</th>
                          <th>{t('localAid')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleCatalog.map((item) => (
                          <tr
                            key={item.identityKey}
                            data-selected={
                              item.identityKey === selectedCatalogKey ? 'true' : 'false'
                            }
                          >
                            <td>
                              <input
                                type="radio"
                                name="power-target"
                                checked={item.identityKey === selectedCatalogKey}
                                onChange={() => {
                                  setSelectedCatalogKey(item.identityKey);
                                  setError('');
                                }}
                                aria-label={t('chooseTargetLabel', {
                                  target: item.displayLabel,
                                  rack: item.footprint,
                                })}
                              />
                            </td>
                            <td>
                              <strong>{item.displayLabel}</strong>
                              <small>{item.equipmentName}</small>
                            </td>
                            <td>{item.footprint}</td>
                            <td>{item.shelf ?? 'NoShelf'}</td>
                            <td>{item.module ?? 'NoSlot'}</td>
                            <td>{item.endpoint ?? 'NoPort'}</td>
                            <td>
                              <code>{item.localAid}</code>
                            </td>
                          </tr>
                        ))}
                        {!visibleCatalog.length ? (
                          <tr>
                            <td colSpan={7} className="power-target-empty">
                              {t('catalogEmpty')}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="power-target-pagination">
                    <span>
                      {t('catalogShowing', {
                        visible: visibleCatalog.length,
                        count: filteredCatalog.length,
                      })}
                    </span>
                    <div>
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setCatalogPage((current) => Math.max(1, current - 1))}
                      >
                        ←
                      </button>
                      <span>
                        {safePage} / {pageCount}
                      </span>
                      <button
                        type="button"
                        disabled={safePage >= pageCount}
                        onClick={() =>
                          setCatalogPage((current) => Math.min(pageCount, current + 1))
                        }
                      >
                        →
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="power-target-new">
                  <p className="power-target-new-help">{t('newTargetHelp')}</p>
                  <div className="power-target-new-grid">
                    <label>
                      {t('equipmentName')} *
                      <input
                        value={newTarget.equipmentName}
                        onChange={(event) => updateNewTarget('equipmentName', event.target.value)}
                        placeholder={t('newEquipmentPlaceholder')}
                      />
                    </label>
                    <label>
                      {t('footprint')} *
                      <input
                        value={newTarget.footprint}
                        onChange={(event) => updateNewTarget('footprint', event.target.value)}
                        placeholder="010208.20"
                      />
                    </label>
                    <label>
                      {t('shelf')}
                      <input
                        value={newTarget.shelf}
                        onChange={(event) => updateNewTarget('shelf', event.target.value)}
                        placeholder={t('shelfPlaceholder')}
                      />
                    </label>
                    <label>
                      {t('moduleSlot')}
                      <input
                        value={newTarget.module}
                        onChange={(event) => updateNewTarget('module', event.target.value)}
                        placeholder={t('modulePlaceholder')}
                      />
                    </label>
                    <label>
                      {t('endpoint')}
                      <input
                        value={newTarget.endpoint}
                        onChange={(event) => updateNewTarget('endpoint', event.target.value)}
                        placeholder={t('endpointPlaceholder')}
                      />
                    </label>
                    <label>
                      {t('displayLabel')}
                      <input
                        value={newTarget.displayLabel}
                        onChange={(event) => updateNewTarget('displayLabel', event.target.value)}
                        placeholder={t('displayLabelPlaceholder')}
                      />
                    </label>
                  </div>
                  <div className="power-target-derived-preview">
                    <span>
                      {t('rackAidPreview')}{' '}
                      <code>
                        {t('rackAidValue', {
                          footprint: newTarget.footprint || t('unknownValue'),
                        })}
                      </code>
                    </span>
                    <span>{t('missingHierarchyHelp')}</span>
                  </div>
                  <button
                    type="button"
                    className="power-target-create"
                    disabled={
                      creatingTarget ||
                      !newTarget.equipmentName.trim() ||
                      !newTarget.footprint.trim()
                    }
                    onClick={() => void createCatalogTarget()}
                  >
                    {creatingTarget ? t('creatingTarget') : t('createAndSelect')}
                  </button>
                </div>
              )}

              <button
                type="button"
                className="power-target-physical-switch"
                onClick={() => {
                  setDestinationMode('PHYSICAL');
                  setError('');
                }}
              >
                {t('usePhysicalPowerInput')}
              </button>
            </>
          ) : (
            <div className="power-target-physical">
              <div className="power-target-physical-heading">
                <strong>{t('physicalPowerPath')}</strong>
                <button
                  type="button"
                  onClick={() => {
                    setDestinationMode('CATALOG');
                    setError('');
                  }}
                >
                  {t('backToCatalog')}
                </button>
              </div>
              <p>{t('chooseTarget')}</p>
              <label>
                {t('searchDestination')}
                <input
                  value={physicalSearch}
                  onChange={(event) => setPhysicalSearch(event.target.value)}
                  placeholder={t('destinationPlaceholder')}
                />
              </label>
              <label>
                {t('destinationInput')}
                <select
                  value={targetId}
                  onChange={(event) => {
                    setTargetId(event.target.value);
                    setError('');
                  }}
                >
                  <option value="">{t('destinationPort')}</option>
                  {filteredPhysicalTargets.map((port) => (
                    <option key={port.id} value={port.id} disabled={port.connected}>
                      {port.equipmentName} / {port.name}
                      {port.feed ? t('feedLabel', { feed: port.feed }) : ''}
                      {port.connected ? t('alreadyConnected') : ''}
                    </option>
                  ))}
                  {target && !filteredPhysicalTargets.some((port) => port.id === target.id) ? (
                    <option value={target.id}>
                      {target.equipmentName} / {target.name}
                    </option>
                  ) : null}
                </select>
              </label>
              {target ? (
                <div className="power-port-connect-preview">
                  <small>{t('selectedDestination')}</small>
                  <strong>{target.equipmentName}</strong>
                  <span>
                    {target.name} · {target.direction}
                  </span>
                  {target.connected ? (
                    <strong role="status">
                      {t('poweredBy')} {target.connectionLabel}
                    </strong>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

    </main>
  );
}
