'use client';

import Link from 'next/link';
import './breaker-limit-editor.css';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { ContextPin } from '@/components/workspace/context-pin';
import { BreakerLimitEditor } from '@/components/power/breaker-limit-editor';
import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';
import type { BdfbPresentation } from '@/modules/power/domain/bdfb-model';
import type { DeviceNode } from '@/modules/topology/domain/entities';

export interface BreakerPowerBinding {
  readonly breakerId: string;
  readonly pathId: string;
  readonly feed?: 'A' | 'B';
  readonly counterpartName: string;
  readonly counterpartHref: string;
  readonly counterpartContext: string;
  readonly accessPortLabel?: string;
  readonly mount?: string;
}
export interface BreakerDeclaredDestination {
  readonly breakerId: string;
  readonly targetName: string;
  readonly feed?: 'A' | 'B';
  readonly companionFeed?: 'A' | 'B';
}
export interface BreakerTelemetryBindingSummary {
  readonly breakerId: string;
  readonly sourceIdentity: string;
  readonly sourcePointId: string;
  readonly metric: string;
}

/**
 * Read-only projection of canonical BDFB Equipment. The top stage displays
 * the physical shelf/frame/panel hierarchy. Selecting a panel exposes its
 * actual breaker-position inventory below without navigating away, while
 * Equipment Composition remains the single editor of record.
 */
export function BdfbChassis({
  device,
  presentation,
  powerBindings = [],
  telemetryBindings = [],
  declaredDestinations = [],
  activePanelId,
}: Readonly<{
  device: DeviceNode;
  presentation: BdfbPresentation;
  powerBindings?: readonly BreakerPowerBinding[];
  telemetryBindings?: readonly BreakerTelemetryBindingSummary[];
  declaredDestinations?: readonly BreakerDeclaredDestination[];
  canWritePower?: boolean;
  activePanelId?: string;
}>) {
  const t = useTranslations('bdfbChassis');
  const frames = presentation.shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const initialPanel =
    panels.find((panel) => panel.id === activePanelId) ??
    panels.find((panel) => panel.positions.some(Boolean)) ??
    panels[0];
  const [selectedId, setSelectedId] = useState(initialPanel?.id ?? '');
  const [editingBreaker, setEditingBreaker] = useState<{
    id: string;
    view: 'limits' | 'history';
    x: number;
    y: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    label: string;
    x: number;
    y: number;
  } | null>(null);

  function openBreakerMenu(
    target: HTMLElement,
    breaker: { readonly id: string; readonly label: string },
  ) {
    const rect = target.getBoundingClientRect();
    const menuWidth = 230;
    const menuHeight = 154;
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
    const below = rect.bottom + 6;
    const y =
      below + menuHeight <= window.innerHeight ? below : Math.max(8, rect.top - menuHeight - 6);
    setEditingBreaker(null);
    setContextMenu({ id: breaker.id, label: breaker.label, x, y });
  }

  function openBreakerEditor(view: 'limits' | 'history') {
    if (!contextMenu) return;
    const width = 390;
    const height = view === 'limits' ? 590 : 430;
    setEditingBreaker({
      id: contextMenu.id,
      view,
      x: Math.max(8, Math.min(contextMenu.x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(contextMenu.y, window.innerHeight - height - 8)),
    });
    setContextMenu(null);
  }
  const selectedPanel = panels.find((panel) => panel.id === selectedId) ?? initialPanel;
  const installed = selectedPanel?.positions.filter((position) => position !== null).length ?? 0;
  const available = (selectedPanel?.positions.length ?? 0) - installed;
  const destinationByBreaker = new Map(powerBindings.map((item) => [item.breakerId, item]));
  const declaredByBreaker = new Map(declaredDestinations.map((item) => [item.breakerId, item]));
  const monitoredBreakers = new Set(telemetryBindings.map((item) => item.breakerId));
  const { snapshot: alarmSnapshot } = useAlarmSnapshot();

  return (
    <section className="bdfb-chassis sm-bdfb-modern sm-bdfb-stage">
      <header className="bdfb-chassis-header">
        <div>
          <span>{t('composition')}</span>
          <strong>{device.name}</strong>
          <small>{t('hierarchyPath')}</small>
        </div>
        <div className="bdfb-chassis-status">
          <ContextPin entityId={device.id} />
          <Link className="bdfb-open-chassis" href={`/device/${presentation.chassisId}`}>
            {t('openChassis')}
          </Link>
          <span>{t('shelves', { count: presentation.shelves.length })}</span>
          <span>{t('frames', { count: frames.length })}</span>
          <span>{t('panels', { count: panels.length })}</span>
        </div>
      </header>
      <div className="sm-bdfb-physical-body">
        <article className="sm-bdfb-physical-chassis">
          <div className="sm-bdfb-physical-title">{t('chassis', { name: device.name })}</div>
          {presentation.shelves.map((shelf) => (
            <section key={shelf.id} className="sm-bdfb-physical-shelf">
              <div className="sm-bdfb-physical-title">
                {shelf.physical === false ? t('panelGroup') : t('shelfLabel')} · {shelf.label}
              </div>
              <div className="sm-bdfb-physical-frames">
                {shelf.frames.map((frame) => (
                  <section key={frame.id} className="sm-bdfb-physical-frame">
                    <div className="sm-bdfb-physical-title">
                      {frame.physical ? 'FRAME' : 'GROUP'} · {frame.label}
                    </div>
                    <div className="sm-bdfb-physical-panels">
                      {frame.panels.map((panel) => {
                        const occupied = panel.positions.filter(Boolean).length;
                        const selected = selectedPanel?.id === panel.id;
                        return (
                          <article
                            key={panel.id}
                            className="sm-bdfb-physical-panel"
                            data-selected={selected}
                            data-alarm-severity={
                              alarmSnapshot.rollups[panel.id]?.highestSeverity ?? 'NONE'
                            }
                          >
                            <button
                              className="sm-bdfb-panel-select"
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setSelectedId(panel.id)}
                              aria-label={t('inspectPanel', {
                                panel: panel.label,
                                installed: occupied,
                              })}
                            >
                              <strong>{panel.label}</strong>
                              <span>
                                {t('panelPositions', {
                                  installed: occupied,
                                  available: panel.positions.length - occupied,
                                })}
                              </span>
                              {alarmSnapshot.rollups[panel.id]?.activeAlarmCount ? (
                                <span
                                  className="sm-panel-alarm-inline"
                                  data-severity={
                                    alarmSnapshot.rollups[panel.id]!.highestSeverity ?? 'INFO'
                                  }
                                >
                                  {t('alarmCount', {
                                    count: alarmSnapshot.rollups[panel.id]!.activeAlarmCount,
                                  })}
                                </span>
                              ) : null}
                            </button>
                            <Link
                              className="sm-bdfb-panel-composition-link"
                              href={`/device/${panel.id}`}
                              title={t('openPanelComposition', { panel: panel.label })}
                            >
                              {t('openPanel')}
                            </Link>
                          </article>
                        );
                      })}
                      {!frame.panels.length && <p>{t('noPanels')}</p>}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          ))}
          {!presentation.shelves.length && <p>{t('empty')}</p>}
        </article>
      </div>

      {selectedPanel && (
        <section className="sm-bdfb-panel-focus" aria-label={t('selectedPanel')}>
          <header className="sm-bdfb-panel-focus-header">
            <div>
              <span>{t('focus')}</span>
              <h2>{selectedPanel.label}</h2>
              <small>{t('readOnly')}</small>
            </div>
            <Link href={`/device/${selectedPanel.id}`}>{t('open')}</Link>
          </header>
          <div className="sm-bdfb-panel-focus-summary" aria-label={t('panelOccupancy')}>
            <div>
              <strong>{installed}</strong>
              <span>{t('installed')}</span>
            </div>
            <div>
              <strong>{available}</strong>
              <span>{t('available')}</span>
            </div>
            <div>
              <strong>{selectedPanel.positions.length}</strong>
              <span>{t('positions')}</span>
            </div>
          </div>
          <div className="sm-bdfb-panel-positions" role="list" aria-label={t('slots')}>
            {selectedPanel.positions.map((breaker, index) => (
              <div
                key={index}
                role="listitem"
                className="sm-bdfb-panel-position"
                data-installed={breaker !== null}
              >
                {breaker ? (
                  <button
                    type="button"
                    className="sm-breaker-position-trigger"
                    title={t('positionBreaker', { position: index + 1, breaker: breaker.label })}
                    aria-label={t('positionBreakerActions', {
                      position: index + 1,
                      breaker: breaker.label,
                    })}
                    onClick={(event) => openBreakerMenu(event.currentTarget, breaker)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openBreakerMenu(event.currentTarget, breaker);
                    }}
                  >
                    <span>P{String(index + 1).padStart(2, '0')}</span>
                    <strong>●</strong>
                    {alarmSnapshot.rollups[breaker.id]?.activeAlarmCount ? (
                      <em
                        className="sm-breaker-alarm-dot"
                        data-severity={alarmSnapshot.rollups[breaker.id]!.highestSeverity ?? 'INFO'}
                      >
                        {alarmSnapshot.rollups[breaker.id]!.activeAlarmCount}
                      </em>
                    ) : null}
                  </button>
                ) : (
                  <span
                    title={t('positionAvailable', { position: index + 1 })}
                    aria-label={t('positionAvailable', { position: index + 1 })}
                  >
                    P{String(index + 1).padStart(2, '0')}
                  </span>
                )}
              </div>
            ))}
          </div>
          {installed > 0 ? (
            <div className="sm-bdfb-breaker-summary">
              <strong>{t('circuits')}</strong>
              {selectedPanel.positions.map((breaker, index) => {
                if (!breaker) return null;
                const declared = declaredByBreaker.get(breaker.id);
                const physical = destinationByBreaker.get(breaker.id);

                return (
                  <div className="sm-bdfb-breaker-summary-row" key={breaker.id}>
                    <span>{t('position', { position: String(index + 1).padStart(2, '0') })}</span>
                    <Link href={`/device/${breaker.id}`}>{breaker.label}</Link>
                    <small>
                      {physical?.counterpartName ?? declared?.targetName ?? t('noDestination')}
                      {declared?.feed ? ` · ${t('feedLabel', { side: declared.feed })}` : ''}
                      {declared?.companionFeed
                        ? ` · ${t('companionAvailable', { side: declared.companionFeed })}`
                        : ''}
                      {' · '}
                      {monitoredBreakers.has(breaker.id) ? t('mqttBound') : t('noMqtt')}
                    </small>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="sm-bdfb-panel-empty">{t('noCircuits')}</p>
          )}
          <p className="sm-bdfb-panel-focus-note">{t('inventoryDisclaimer')}</p>
        </section>
      )}
      {contextMenu ? (
        <>
          <button
            type="button"
            className="sm-breaker-context-dismiss"
            onClick={() => setContextMenu(null)}
            aria-label={t('closeMenu')}
            tabIndex={-1}
          />
          <div
            className="sm-breaker-context-menu"
            role="menu"
            aria-label={t('breakerActions', { breaker: contextMenu.label })}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setContextMenu(null);
            }}
          >
            <header>
              <strong>{contextMenu.label}</strong>
              <small>{t('chooseAction')}</small>
            </header>
            <button
              type="button"
              role="menuitem"
              autoFocus
              onClick={() => openBreakerEditor('limits')}
            >
              {t('configureLimits')}
            </button>
            <button type="button" role="menuitem" onClick={() => openBreakerEditor('history')}>
              {t('viewHistory')}
            </button>
            <Link
              role="menuitem"
              href={`/device/${contextMenu.id}`}
              onClick={() => setContextMenu(null)}
            >
              {t('openBreaker')}
            </Link>
          </div>
        </>
      ) : null}
      {editingBreaker ? (
        <BreakerLimitEditor
          key={`${editingBreaker.id}:${editingBreaker.view}`}
          breakerId={editingBreaker.id}
          view={editingBreaker.view}
          x={editingBreaker.x}
          y={editingBreaker.y}
          onClose={() => setEditingBreaker(null)}
        />
      ) : null}
    </section>
  );
}
