'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import type { EquipmentNode } from '@/modules/topology/domain/entities';
import type { CompositionBreakerTelemetry } from '@/modules/telemetry/domain/composition-breaker-telemetry';
import { projectCompositionTelemetry } from '@/modules/telemetry/application/composition-telemetry-summary';
import { SnmpCapacityStrip } from './snmp-capacity-strip';

interface Props {
  readonly root: EquipmentNode;
  readonly equipmentById: ReadonlyMap<string, EquipmentNode>;
  readonly readings: Readonly<Record<string, CompositionBreakerTelemetry>>;
  readonly onAdd?: (slot: number | null) => void;
  readonly canReadTelemetry?: boolean;
}

const METRICS = [
  { key: 'voltageV', symbol: 'V', unit: 'V', digits: 2 },
  { key: 'currentA', symbol: 'I', unit: 'A', digits: 2 },
  { key: 'powerW', symbol: 'P', unit: 'W', digits: 2 },
  { key: 'energyKwh', symbol: 'E', unit: 'kWh', digits: 4 },
] as const;

function formatted(value: number | undefined, digits: number): string {
  return value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

function activeChildren(node: EquipmentNode, byId: ReadonlyMap<string, EquipmentNode>) {
  return node.children.flatMap((id, index) => {
    const child = id ? byId.get(id) : undefined;
    return child?.lifecycle === 'ACTIVE' ? [{ child, position: index + 1 }] : [];
  });
}

function destination(id: string) {
  return '/device/' + encodeURIComponent(id);
}

function Counts({ node }: Readonly<{ node: EquipmentNode }>) {
  const t = useTranslations('equipmentView');
  const occupied = node.children.filter(Boolean).length;
  return (
    <span className="ec-count">
      <b>{occupied}</b>
      {node.childMode === 'POSITIONAL' ? ` / ${node.children.length} occupied` : ' installed'}
    </span>
  );
}

function ChildLink({
  node,
  children,
  className = '',
}: Readonly<{ node: EquipmentNode; children?: ReactNode; className?: string }>) {
  return (
    <Link className={className} href={destination(node.id)}>
      {children ?? node.name}
      <span className="ec-open" aria-hidden="true">
        ↗
      </span>
    </Link>
  );
}

function PanelPreview({ panel }: Readonly<{ panel: EquipmentNode }>) {
  const t = useTranslations('equipmentView');
  return (
    <ChildLink node={panel} className="ec-panel-line">
      <strong className="ec-panel-name">{panel.name}</strong>
      <span className="ec-panel-meta">
        {panel.childMode === 'POSITIONAL'
          ? `${panel.children.length} positions · ${panel.children.filter(Boolean).length} occupied`
          : t('installedCount', { count: panel.children.filter(Boolean).length })}
        <span className="ec-panel-presence">
          {panel.children.some(Boolean) ? t('installedStatus') : t('availableStatus')}
        </span>
      </span>
    </ChildLink>
  );
}

function FramePreview({
  frame,
  byId,
  readings,
}: Readonly<{
  frame: EquipmentNode;
  byId: ReadonlyMap<string, EquipmentNode>;
  readings: Props['readings'];
}>) {
  const t = useTranslations('equipmentView');
  const panels = activeChildren(frame, byId).filter(({ child }) => child.equipmentType === 'PANEL');
  const signal = projectCompositionTelemetry(frame, byId, readings);
  return (
    <article className="ec-frame-card">
      <div className="ec-frame-heading">
        <div>
          <small>{t('frame')}</small>
          <ChildLink node={frame} className="ec-frame-title" />
        </div>
        <span className="ec-count">
          {t('frameMqttLive', { reporting: signal.reportingChildren, total: panels.length })}
        </span>
      </div>
      <div className="ec-frame-panels">
        {panels.length ? (
          panels.map(({ child }) => <PanelPreview key={child.id} panel={child} />)
        ) : (
          <p className="ec-muted">{t('noPanelsInstalled')}</p>
        )}
      </div>
    </article>
  );
}

function BreakerMetrics({
  reading,
}: Readonly<{ reading: CompositionBreakerTelemetry | undefined }>) {
  return (
    <>
      {METRICS.map((item) => (
        <span className="ec-reading" key={item.key} title={item.unit}>
          <span className="ec-metric-key">{item.symbol}</span>
          <strong>{formatted(reading?.[item.key], item.digits)}</strong>
          <small>{item.unit}</small>
        </span>
      ))}
    </>
  );
}

function BreakerRow({
  breaker,
  position,
  reading,
}: Readonly<{
  breaker: EquipmentNode;
  position: number;
  reading: CompositionBreakerTelemetry | undefined;
}>) {
  const status = reading?.status ?? 'UNMAPPED';
  return (
    <ChildLink node={breaker} className="ec-breaker-row">
      <span className="ec-pos">{String(position).padStart(2, '0')}</span>
      <span className="ec-breaker-name" title={breaker.name}>
        {breaker.name}
      </span>
      <BreakerMetrics reading={reading} />
      <span className="ec-status" data-status={status}>
        <span className="ec-status-dot" aria-hidden="true" />
        <span className="ec-status-text">{status}</span>
      </span>
    </ChildLink>
  );
}

function PanelComposition({
  root,
  byId,
  readings,
  onAdd,
}: Readonly<{
  root: EquipmentNode;
  byId: ReadonlyMap<string, EquipmentNode>;
  readings: Props['readings'];
  onAdd?: Props['onAdd'];
}>) {
  const t = useTranslations('equipmentView');
  const slots = root.children.map((id, index) => ({
    id,
    index,
    child: id ? byId.get(id) : undefined,
  }));
  const installed = slots.filter((slot) => Boolean(slot.id));
  const available = root.childMode === 'POSITIONAL' ? slots.filter((slot) => slot.id === null) : [];
  return (
    <section className="ec-panel-composition" aria-label={t('physicalPositions')}>
      <header className="ec-section-heading">
        <div>
          <small>{t('physicalPanel')}</small>
          <strong>{t('physicalPositions')}</strong>
        </div>
        <div className="ec-heading-counts">
          <span>{t('countInstalled', { count: installed.length })}</span>
          {root.childMode === 'POSITIONAL' && (
            <span>{t('countAvailable', { count: available.length })}</span>
          )}
          <span>{t('countTotal', { count: slots.length })}</span>
        </div>
      </header>
      <div
        className="ec-table-scroll"
        role="region"
        tabIndex={0}
        aria-label={t('breakerMeasurements')}
      >
        <div className="ec-breaker-table">
          <div className="ec-breaker-columns" aria-hidden="true">
            <span>{t('position')}</span>
            <span>{t('breaker')}</span>
            <span>V · V</span>
            <span>I · A</span>
            <span>P · W</span>
            <span>E · kWh</span>
            <span>{t('status')}</span>
          </div>
          {slots.length ? (
            slots.map(({ id, index, child }) =>
              child?.lifecycle === 'ACTIVE' && child.equipmentType === 'CIRCUIT_BREAKER' ? (
                <BreakerRow
                  key={id}
                  breaker={child}
                  position={index + 1}
                  reading={readings[child.id]}
                />
              ) : id ? (
                <div className="ec-missing-row" key={id}>
                  <span className="ec-pos">{String(index + 1).padStart(2, '0')}</span>
                  <strong>{child?.name ?? t('reference')}</strong>
                  <span>{child?.equipmentType ?? t('notAvailable')}</span>
                  {child && <ChildLink node={child}>{t('openEquipment')}</ChildLink>}
                </div>
              ) : (
                <div className="ec-empty-breaker-row" key={index}>
                  <span className="ec-pos">{String(index + 1).padStart(2, '0')}</span>
                  {onAdd ? (
                    <button
                      type="button"
                      onClick={() => onAdd(index)}
                      aria-label={t('installPosition', { count: index + 1 })}
                    >
                      {t('install')}
                    </button>
                  ) : (
                    <span className="ec-empty-slot-label">{t('emptySlot')}</span>
                  )}
                  <span aria-hidden="true">—</span>
                  <span aria-hidden="true">—</span>
                  <span aria-hidden="true">—</span>
                  <span aria-hidden="true">—</span>
                  <span className="ec-status-available">{t('available')}</span>
                </div>
              ),
            )
          ) : (
            <p className="ec-empty-panel">{t('noBreakers')}</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function EquipmentContractViews({
  root,
  equipmentById,
  readings,
  onAdd,
  canReadTelemetry = false,
}: Props) {
  const t = useTranslations('equipmentView');
  const children = activeChildren(root, equipmentById);
  const summary = projectCompositionTelemetry(root, equipmentById, readings);
  const type = root.equipmentType;
  return (
    <div className="ec-contract" data-equipment-type={type}>
      <div className="ec-topline">
        <span className="ec-eyebrow">
          {t('physicalComposition')} <span aria-hidden="true">/</span> {type.replaceAll('_', ' ')}
        </span>
        {summary.reporting > 0 && (
          <span className="ec-topline-status">
            <span className="ec-status-dot" aria-hidden="true" /> {summary.reporting}/
            {t('reportingBreakers', { count: summary.installed })}
          </span>
        )}
      </div>
      {canReadTelemetry && (
        <div className="ec-live-cover" aria-label={t('coverage')}>
          <span>
            {type === 'CIRCUIT_BREAKER'
              ? t('breakerLive', { count: summary.reporting })
              : type === 'PANEL'
                ? t('positionsLive', { reporting: summary.reporting, total: summary.positions })
                : t('childEquipmentLive', {
                    reporting: summary.reportingChildren,
                    total: summary.installedChildren,
                  })}
          </span>
          <small>{t('verifiedBreakers', { count: summary.reporting })}</small>
        </div>
      )}
      <div className="ec-focus">
        <div>
          <small>{t('focused')}</small>
          <h2>{root.name}</h2>
          <p>
            {root.model ?? root.equipmentType.replaceAll('_', ' ')} ·{' '}
            {root.childMode === 'POSITIONAL'
              ? t('physicalPositionsCount', { count: root.children.length })
              : t('childEquipmentCount', { count: children.length })}
          </p>
        </div>
        <div className="ec-focus-badges">
          <span>{t('countInstalled', { count: children.length })}</span>
          <span>
            {t('ports', {
              count: root.accessPorts.filter((port) => port.lifecycle === 'ACTIVE').length,
            })}
          </span>
        </div>
      </div>

      {type === 'CHASSIS' && (
        <section className="ec-main-section" aria-label={t('chassis')}>
          <header className="ec-section-heading">
            <div>
              <small>{t('chassisInterior')}</small>
              <strong>{t('shelvesFrames')}</strong>
            </div>
            <span>{t('assemblies', { count: children.length })}</span>
          </header>
          <div className="ec-chassis-shelves">
            {children.length ? (
              children.map(({ child }) => (
                <article className="ec-shelf-card" key={child.id}>
                  <div className="ec-shelf-card-heading">
                    <div>
                      <small>{child.equipmentType.replaceAll('_', ' ')}</small>
                      <ChildLink node={child} className="ec-shelf-link" />
                    </div>
                    <Counts node={child} />
                  </div>
                  <div className="ec-chassis-frame-strip">
                    {child.equipmentType === 'FRAME' ? (
                      activeChildren(child, equipmentById).map(({ child: panel }) => (
                        <PanelPreview key={panel.id} panel={panel} />
                      ))
                    ) : activeChildren(child, equipmentById).length ? (
                      activeChildren(child, equipmentById).map(({ child: frame }) => (
                        <ChildLink node={frame} key={frame.id} className="ec-chassis-frame">
                          <strong>{frame.name}</strong>
                          <small>
                            <Counts node={frame} />
                          </small>
                        </ChildLink>
                      ))
                    ) : (
                      <span className="ec-muted">{t('noChildren')}</span>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="ec-muted">{t('noShelves')}</p>
            )}
          </div>
        </section>
      )}

      {(type === 'SHELF' || type === 'SUB_SHELF') && (
        <section className="ec-main-section" aria-label={t('shelfFrames')}>
          <header className="ec-section-heading">
            <div>
              <small>{t('shelfStructure')}</small>
              <strong>{t('frames')}</strong>
            </div>
            <span>{t('framesRecorded', { count: children.length })}</span>
          </header>
          <div className="ec-frames-grid">
            {children.map(({ child }) => (
              <FramePreview key={child.id} frame={child} byId={equipmentById} readings={readings} />
            ))}
            {!children.length && <p className="ec-muted">{t('noFrames')}</p>}
          </div>
        </section>
      )}

      {type === 'FRAME' && (
        <section className="ec-main-section" aria-label={t('framePanels')}>
          <header className="ec-section-heading">
            <div>
              <small>{t('frameInterior')}</small>
              <strong>{t('panels')}</strong>
            </div>
            <span>{t('panelsRecorded', { count: children.length })}</span>
          </header>
          <div className="ec-frame-rows">
            {children.map(({ child, position }) => (
              <div className="ec-frame-row" key={child.id}>
                <span className="ec-pos">{String(position).padStart(2, '0')}</span>
                <div>
                  <ChildLink node={child} className="ec-frame-row-name" />
                  <Counts node={child} />
                </div>
                <span className="ec-count">
                  {projectCompositionTelemetry(child, equipmentById, readings).reporting}/
                  {child.childMode === 'POSITIONAL'
                    ? child.children.length
                    : child.children.filter(Boolean).length}{' '}
                  {t('livePositions')}
                </span>
              </div>
            ))}
            {!children.length && <p className="ec-muted">{t('noPanels')}</p>}
          </div>
        </section>
      )}

      {type === 'PANEL' && (
        <PanelComposition root={root} byId={equipmentById} readings={readings} onAdd={onAdd} />
      )}

      {type === 'CIRCUIT_BREAKER' && (
        <section className="ec-breaker-detail" aria-label={t('breakerTelemetry')}>
          <div className="ec-section-heading">
            <div>
              <small>{t('circuitBreaker')}</small>
              <strong>
                {readings[root.id]?.status === 'LIVE' ? t('ownTelemetry') : t('circuitDetails')}
              </strong>
            </div>
            <span className="ec-status" data-status={readings[root.id]?.status ?? 'UNMAPPED'}>
              <span className="ec-status-dot" aria-hidden="true" />
              {readings[root.id]?.status ?? 'UNMAPPED'}
            </span>
          </div>
          {readings[root.id]?.status === 'LIVE' ? (
            <div className="ec-breaker-metrics">
              <BreakerMetrics reading={readings[root.id]} />
            </div>
          ) : (
            <p className="ec-breaker-no-data">{t('noReadings')}</p>
          )}
          <p className="ec-breaker-source">
            {t('mqttSourceCaption')} {readings[root.id]?.sourceIdentity ?? t('noVerifiedBinding')} ·{' '}
            {t('packetCaption')} {readings[root.id]?.receivedAt ?? '—'}
          </p>
          <Link className="ec-trace-link" href={`/power?entityId=${encodeURIComponent(root.id)}`}>
            {t('explorePower')}
          </Link>
        </section>
      )}
      {canReadTelemetry && ['CHASSIS', 'SHELF', 'SUB_SHELF', 'FRAME', 'PANEL'].includes(type) && (
        <SnmpCapacityStrip root={root} byId={equipmentById} />
      )}
      {summary.reporting > 0 && (
        <div className="ec-legend" aria-label={t('metrics')}>
          <span>
            <b>V</b> {t('voltage')}
          </span>
          <span>
            <b>I</b> {t('current')}
          </span>
          <span>
            <b>P</b> {t('power')}
          </span>
          <span>
            <b>E</b> {t('energy')}
          </span>
        </div>
      )}
    </div>
  );
}
