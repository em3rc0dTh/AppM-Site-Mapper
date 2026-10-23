'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { ContextPin } from '@/components/workspace/context-pin';
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
  activePanelId,
}: Readonly<{
  device: DeviceNode;
  presentation: BdfbPresentation;
  powerBindings?: readonly BreakerPowerBinding[];
  telemetryBindings?: readonly BreakerTelemetryBindingSummary[];
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
  const selectedPanel = panels.find((panel) => panel.id === selectedId) ?? initialPanel;
  const installed = selectedPanel?.positions.filter((position) => position !== null).length ?? 0;
  const available = (selectedPanel?.positions.length ?? 0) - installed;
  const destinationByBreaker = new Map(powerBindings.map((item) => [item.breakerId, item]));
  const monitoredBreakers = new Set(telemetryBindings.map((item) => item.breakerId));

  return (
    <section className="bdfb-chassis sm-bdfb-modern sm-bdfb-stage">
      <header className="bdfb-chassis-header">
        <div>
          <span>{t('composition')}</span>
          <strong>{device.name}</strong>
          <small>Device → Chassis → Shelf → Frame → Panel → Equipment</small>
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
                          >
                            <button
                              className="sm-bdfb-panel-select"
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setSelectedId(panel.id)}
                              aria-label={`Inspect panel ${panel.label}, ${occupied} breakers installed`}
                            >
                              <strong>{panel.label}</strong>
                              <span>
                                {occupied} installed · {panel.positions.length - occupied} available
                                positions
                              </span>
                            </button>
                            <Link
                              className="sm-bdfb-panel-composition-link"
                              href={`/device/${panel.id}`}
                              title={`Open Equipment Composition: ${panel.label}`}
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
                  <Link
                    href={`/device/${breaker.id}`}
                    title={`Position ${index + 1}: ${breaker.label}`}
                    aria-label={`Position ${index + 1}: ${breaker.label}; open breaker details`}
                  >
                    <span>P{String(index + 1).padStart(2, '0')}</span>
                    <strong>●</strong>
                  </Link>
                ) : (
                  <span
                    title={`Position ${index + 1}: available`}
                    aria-label={`Position ${index + 1}: available`}
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
              {selectedPanel.positions.map((breaker, index) =>
                breaker ? (
                  <div className="sm-bdfb-breaker-summary-row" key={breaker.id}>
                    <span>{t('position', { position: String(index + 1).padStart(2, '0') })}</span>
                    <Link href={`/device/${breaker.id}`}>{breaker.label}</Link>
                    <small>
                      {destinationByBreaker.get(breaker.id)?.counterpartName ?? t('noDestination')}
                      {' · '}
                      {monitoredBreakers.has(breaker.id) ? t('mqttBound') : t('noMqtt')}
                    </small>
                  </div>
                ) : null,
              )}
            </div>
          ) : (
            <p className="sm-bdfb-panel-empty">{t('noCircuits')}</p>
          )}
          <p className="sm-bdfb-panel-focus-note">
            {t('inventoryDisclaimer')}
          </p>
        </section>
      )}
    </section>
  );
}
