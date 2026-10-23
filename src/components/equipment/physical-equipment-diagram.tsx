'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { EquipmentContractViews } from './equipment-contract-views';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  projectEquipmentComposition,
  projectResponsiveCompositionGrid,
  shouldSummarizeFocus,
} from '@/modules/topology/application/equipment-composition-projection';
import type { AccessPort, EquipmentNode } from '@/modules/topology/domain/entities';
import type { PortConnectionView } from '@/modules/power/domain/port-connection-view';
import { useTelemetryStream } from '@/components/telemetry/use-bdfb-telemetry';
import {
  compositionBreakerTelemetry,
  type CompositionBreakerBinding,
  type CompositionBreakerTelemetry,
} from '@/modules/telemetry/domain/composition-breaker-telemetry';

interface Props {
  readonly root: EquipmentNode;
  readonly equipment: readonly EquipmentNode[];
  readonly onAdd?: ((slot: number | null) => void) | undefined;
  readonly canWritePower?: boolean | undefined;
  readonly canReadTelemetry?: boolean | undefined;
  readonly breakerTelemetryBindings?: readonly CompositionBreakerBinding[] | undefined;
  readonly portConnections?: readonly PortConnectionView[] | undefined;
}

function BreakerMeasurementStrip({ reading }: Readonly<{ reading: CompositionBreakerTelemetry }>) {
  const t = useTranslations('physicalDiagram');
  const metrics = [
    { label: 'V', value: reading.voltageV, unit: 'V' },
    { label: 'I', value: reading.currentA, unit: 'A' },
    { label: 'P', value: reading.powerW, unit: 'W' },
    { label: 'E', value: reading.energyKwh, unit: 'kWh' },
  ];
  return (
    <div className="equipment-breaker-telemetry" data-state={reading.status}>
      <div className="equipment-breaker-telemetry-header">
        <strong>MQTT · {reading.status}</strong>
        {reading.state && <span>{reading.state}</span>}
      </div>
      <div className="equipment-breaker-telemetry-values" aria-label={t('telemetry')}>
        {metrics.map((metric) => (
          <span key={metric.label}>
            <b>{metric.label}</b>{' '}
            {metric.value === undefined
              ? '—'
              : `${metric.value.toFixed(metric.label === 'E' ? 4 : 2)} ${metric.unit}`}
          </span>
        ))}
      </div>
      <small>
        {reading.sourceIdentity
          ? `${reading.sourceIdentity}${reading.sourcePointId ? ` / ${reading.sourcePointId}` : ` / ${t('ownSource')}`} · ${reading.receivedAt ?? '—'}`
          : reading.status === 'UNMAPPED'
            ? t('noBinding')
            : reading.status === 'NO DATA'
              ? (reading.diagnostic ?? t('waiting'))
              : reading.status === 'CONFLICT'
                ? t('conflict')
                : t('telemetryUnavailable')}
      </small>
    </div>
  );
}

function EquipmentPreview({
  equipment,
  equipmentById,
  slotIndex,
  breakerTelemetry,
}: Readonly<{
  equipment: EquipmentNode;
  equipmentById: ReadonlyMap<string, EquipmentNode>;
  slotIndex: number;
  breakerTelemetry?: CompositionBreakerTelemetry;
}>) {
  const t = useTranslations('physicalDiagram');
  const composition = projectEquipmentComposition(equipment, equipmentById);
  const ports = equipment.accessPorts.filter((port) => port.lifecycle === 'ACTIVE');
  const preview =
    composition.capacity > 4 ? [] : composition.slots.filter((slot) => slot.equipment).slice(0, 4);
  return (
    <article className="equipment-physical-preview">
      <div className="equipment-physical-preview-heading">
        <span className="equipment-physical-position">
          {t('position', { value: String(slotIndex + 1).padStart(2, '0') })}
        </span>
        <span className="equipment-physical-type">
          {equipment.equipmentType.replaceAll('_', ' ')}
        </span>
      </div>
      <Link
        href={'/device/' + encodeURIComponent(equipment.id)}
        className="equipment-physical-preview-name"
      >
        {equipment.name}
      </Link>
      {equipment.equipmentType === 'CIRCUIT_BREAKER' && breakerTelemetry && (
        <BreakerMeasurementStrip reading={breakerTelemetry} />
      )}
      <div className="equipment-physical-preview-meta">
        <span>
          {composition.positional
            ? t('occupancy', { occupied: composition.occupied, total: composition.capacity })
            : t('installed', { count: composition.occupied })}
        </span>
        {ports.length > 0 && (
          <span>
            {t('accessPorts', {
              count: ports.length,
              kind: ports.length === 1 ? t('port') : t('ports'),
            })}
          </span>
        )}
      </div>
      {preview.length > 0 && (
        <div
          className="equipment-physical-preview-children"
          aria-label={t('childPreview', { name: equipment.name })}
        >
          {preview.map((item) => {
            const child = item.equipment!;
            const childComposition = projectEquipmentComposition(child, equipmentById);
            return (
              <Link
                key={item.index}
                href={'/device/' + encodeURIComponent(child.id)}
                className="equipment-physical-preview-child"
              >
                <span>{child.equipmentType.replaceAll('_', ' ')}</span>
                <strong>{child.name}</strong>
                <small>
                  {childComposition.positional
                    ? t('occupancy', {
                        occupied: childComposition.occupied,
                        total: childComposition.capacity,
                      })
                    : t('installed', { count: childComposition.occupied })}
                </small>
              </Link>
            );
          })}
          {composition.occupied > preview.length && (
            <span className="equipment-physical-preview-more">
              +{composition.occupied - preview.length} {t('moreInspect')}
            </span>
          )}
        </div>
      )}
      {composition.capacity > 4 && (
        <div className="equipment-physical-mini-capacity">
          <span>
            {t('capacity', {
              count: composition.capacity,
              kind: composition.positional ? t('positions') : t('children'),
            })}
          </span>
        </div>
      )}
    </article>
  );
}

function PortFace({
  ports,
  portConnections = [],
  canWritePower = false,
}: Readonly<{
  ports: readonly AccessPort[];
  portConnections?: readonly PortConnectionView[];
  canWritePower?: boolean;
}>) {
  const t = useTranslations('physicalDiagram');
  const active = useMemo(() => ports.filter((port) => port.lifecycle === 'ACTIVE'), [ports]);
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (!active.length) return null;
  const selected = active.find((port) => port.id === selectedPortId);
  const selectedLinks = portConnections.filter((link) => link.portId === selectedPortId);
  const visible = showAll ? active : active.slice(0, 48);

  return (
    <section className="equipment-faceplate" aria-label={t('access')}>
      <header className="equipment-faceplate-header">
        <div>
          <strong>{t('terminals')}</strong>
          <span>{t('recorded', { count: active.length })}</span>
        </div>
        <span className="equipment-faceplate-status">{t('front')}</span>
      </header>
      <div className="equipment-faceplate-surface">
        <div className="equipment-faceplate-ports">
          {visible.map((port) => (
            <button
              key={port.id}
              type="button"
              className="equipment-faceplate-port"
              data-kind={port.portType}
              aria-label={`Inspect ${port.name}, ${port.portType} port`}
              aria-pressed={selectedPortId === port.id}
              title={`${port.name} · ${port.connectorType ?? port.portType}`}
              onClick={() => setSelectedPortId((current) => (current === port.id ? null : port.id))}
            >
              <span className="equipment-faceplate-port-socket" aria-hidden="true">
                <span />
              </span>
              <strong>{port.name}</strong>
              <small>{port.connectorType || port.portType}</small>
              {portConnections.some((link) => link.portId === port.id) && (
                <span className="equipment-terminal-occupied">{t('connected')}</span>
              )}
            </button>
          ))}
        </div>
        {active.length > 48 && (
          <button
            className="equipment-faceplate-more"
            type="button"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? t('showFirst') : t('showAll', { count: active.length })}
          </button>
        )}
      </div>
      {selected ? (
        <div
          className="equipment-faceplate-selection"
          role="region"
          aria-label={t('selectedPort', { name: selected.name })}
        >
          <div>
            <small>{t('selected')}</small>
            <strong>{selected.name}</strong>
            <span>
              {selected.portType} · {selected.direction ?? t('unknownDirection')}
            </span>
          </div>
          <dl>
            <dt>{t('exposure')}</dt>
            <dd>{selected.exposure}</dd>
            <dt>{t('connector')}</dt>
            <dd>{selected.connectorType || t('notRecorded')}</dd>
            <dt>{t('protocol')}</dt>
            <dd>{selected.protocol || t('notRecorded')}</dd>
          </dl>
          {selectedLinks.length > 0 && (
            <div className="equipment-terminal-connection" role="status">
              <strong>{t('paths', { count: selectedLinks.length })}</strong>
              {selectedLinks.map((link) => (
                <div key={link.pathId}>
                  <span>
                    {link.flow === 'OUTGOING' ? t('feeds') : t('poweredBy')}
                    {link.peerEquipmentName} / {link.peerPortName}
                    {link.feed ? t('feedLetter', { feed: link.feed }) : ''}
                  </span>{' '}
                  <Link href={`/power?path=${encodeURIComponent(link.pathId)}`}>
                    {t('viewPowerPath')}
                  </Link>
                </div>
              ))}
            </div>
          )}
          <div className="equipment-faceplate-selection-actions">
            {canWritePower && selected.portType === 'POWER' && !selectedLinks.length && (
              <Link
                className="equipment-access-port-connect"
                href={`/power/connect/equipment?${selected.direction === 'INPUT' ? 'target' : 'source'}=${encodeURIComponent(selected.id)}`}
              >
                {selected.direction === 'INPUT' ? t('connectSource') : t('connectLoad')}
              </Link>
            )}
            <button type="button" onClick={() => setSelectedPortId(null)}>
              {t('close')}
            </button>
          </div>
        </div>
      ) : (
        <p className="equipment-faceplate-hint">{t('help')}</p>
      )}
    </section>
  );
}

export function PhysicalEquipmentDiagram({
  root,
  equipment,
  onAdd,
  canWritePower = false,
  canReadTelemetry = false,
  breakerTelemetryBindings = [],
  portConnections = [],
}: Props) {
  const t = useTranslations('physicalDiagram');
  const equipmentById = useMemo(
    () => new Map(equipment.map((item) => [item.id, item])),
    [equipment],
  );
  const projection = projectEquipmentComposition(root, equipmentById);
  const { samples, now } = useTelemetryStream(canReadTelemetry);
  const breakerReadings = useMemo(
    () =>
      Object.fromEntries(
        equipment
          .filter((item) => item.lifecycle === 'ACTIVE' && item.equipmentType === 'CIRCUIT_BREAKER')
          .map((item) => [
            item.id,
            canReadTelemetry
              ? compositionBreakerTelemetry(
                  item.id,
                  item.deviceId,
                  samples,
                  breakerTelemetryBindings,
                  now,
                )
              : ({ status: 'NO DATA' } as const),
          ]),
      ) as Readonly<Record<string, CompositionBreakerTelemetry>>,
    [equipment, canReadTelemetry, samples, breakerTelemetryBindings, now],
  );
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(48);
  const compositionRef = useRef<HTMLElement | null>(null);
  const [compositionWidth, setCompositionWidth] = useState(0);
  useEffect(() => {
    const element = compositionRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setCompositionWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [projection.capacity]);
  const hasPorts = root.accessPorts.some((port) => port.lifecycle === 'ACTIVE');
  const summarized = !expanded && shouldSummarizeFocus(projection);
  const dense = projection.positional && projection.capacity > 4;
  const grid = projectResponsiveCompositionGrid(projection, compositionWidth || 900);
  const useColumnDirection = grid.direction === 'COLUMN';
  const slots = projection.slots.slice(0, visibleCount);
  const style = {
    '--composition-columns': grid.columns,
    '--composition-rows': grid.rows,
  } as CSSProperties;

  const contracted =
    root.equipmentType === 'SHELF' ||
    root.equipmentType === 'SUB_SHELF' ||
    root.equipmentType === 'FRAME' ||
    root.equipmentType === 'PANEL' ||
    root.equipmentType === 'CIRCUIT_BREAKER' ||
    (root.equipmentType === 'CHASSIS' &&
      projection.slots.some(
        (slot) =>
          slot.equipment && ['SHELF', 'SUB_SHELF', 'FRAME'].includes(slot.equipment.equipmentType),
      ));

  if (contracted) {
    return (
      <div
        className="equipment-physical-canvas equipment-contract-canvas"
        aria-label={t('composition')}
      >
        <EquipmentContractViews
          root={root}
          equipmentById={equipmentById}
          readings={breakerReadings}
          canReadTelemetry={canReadTelemetry}
          {...(onAdd ? { onAdd } : {})}
        />
        {hasPorts && (
          <PortFace
            ports={root.accessPorts}
            portConnections={portConnections}
            canWritePower={canWritePower}
          />
        )}
      </div>
    );
  }

  return (
    <div className="equipment-physical-canvas" aria-label={t('composition')}>
      <div className="equipment-physical-shell">
        <header className="equipment-physical-shell-header">
          <div>
            <span>{t('focused')}</span>
            <strong>{root.name}</strong>
            <small>
              {root.equipmentType.replaceAll('_', ' ')} · {root.childMode}
            </small>
          </div>
          <div className="equipment-physical-shell-stats">
            <span>
              <b>{projection.occupied}</b> {t('installedCaption')}
            </span>
            {projection.positional && (
              <span>
                <b>{projection.available}</b> {t('free')}
              </span>
            )}
            <span>
              <b>{root.accessPorts.filter((port) => port.lifecycle === 'ACTIVE').length}</b>{' '}
              {t('accessPortsCaption')}
            </span>
          </div>
        </header>

        {projection.capacity > 0 && (
          <section
            ref={compositionRef}
            className="equipment-physical-bays"
            aria-label={t('immediate')}
          >
            <header className="equipment-physical-subheading">
              <strong>{t('internal')}</strong>
              <small>
                {projection.positional
                  ? t('occupancy', { occupied: projection.occupied, total: projection.capacity })
                  : t('installed', { count: projection.occupied })}
              </small>
            </header>
            {summarized ? (
              <div className="equipment-physical-summary">
                <p>
                  {t('immediateOccupancy', {
                    total: projection.capacity,
                    kind: projection.positional ? t('positions') : t('children'),
                    occupied: projection.occupied,
                  })}
                </p>
                <button type="button" onClick={() => setExpanded(true)}>
                  {t('exploreComposition')}
                </button>
              </div>
            ) : (
              <>
                <div
                  className={`equipment-physical-children ${useColumnDirection ? 'is-column' : 'is-row'} ${dense ? 'is-dense' : ''} ${projection.capacity <= 4 && projection.occupied > 0 && projection.available > 0 ? 'is-mixed' : ''}`}
                  style={style}
                >
                  {slots.map((slot) => (
                    <div key={slot.index} className="equipment-physical-child">
                      {slot.equipment ? (
                        projection.positional && projection.capacity > 4 ? (
                          <Link
                            href={'/device/' + encodeURIComponent(slot.equipment.id)}
                            className="equipment-physical-slot is-occupied"
                            title={slot.equipment.name}
                          >
                            <small>{String(slot.index + 1).padStart(2, '0')}</small>
                            <strong>{slot.equipment.equipmentType.replaceAll('_', ' ')}</strong>
                            <span>{slot.equipment.name}</span>
                            {slot.equipment.equipmentType === 'CIRCUIT_BREAKER' && (
                              <BreakerMeasurementStrip
                                reading={
                                  breakerReadings[slot.equipment.id] ?? { status: 'UNMAPPED' }
                                }
                              />
                            )}
                          </Link>
                        ) : (
                          <EquipmentPreview
                            equipment={slot.equipment}
                            equipmentById={equipmentById}
                            slotIndex={slot.index}
                            {...(slot.equipment.equipmentType === 'CIRCUIT_BREAKER'
                              ? {
                                  breakerTelemetry: breakerReadings[slot.equipment.id] ?? {
                                    status: 'UNMAPPED',
                                  },
                                }
                              : {})}
                          />
                        )
                      ) : (
                        <div
                          className={`equipment-physical-empty ${projection.positional && projection.capacity > 4 ? 'is-dense' : ''}`}
                        >
                          <small>
                            {t('position', { value: String(slot.index + 1).padStart(2, '0') })}
                          </small>
                          <span>{slot.equipmentId ? t('missingEquipment') : t('available')}</span>
                          {!slot.equipmentId && onAdd && (
                            <button
                              type="button"
                              onClick={() => onAdd(projection.positional ? slot.index : null)}
                              aria-label={t('addPosition', { position: slot.index + 1 })}
                            >
                              {t('addEquipment')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {projection.capacity > visibleCount && (
                  <button
                    className="equipment-physical-more"
                    type="button"
                    onClick={() =>
                      setVisibleCount((current) => Math.min(current + 48, projection.capacity))
                    }
                  >
                    {t('showNext', { count: Math.min(48, projection.capacity - visibleCount) })}
                  </button>
                )}
                {expanded && shouldSummarizeFocus(projection) && (
                  <button
                    className="equipment-physical-more"
                    type="button"
                    onClick={() => {
                      setExpanded(false);
                      setVisibleCount(48);
                    }}
                  >
                    {t('backSummary')}
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {hasPorts && (
          <PortFace
            ports={root.accessPorts}
            portConnections={portConnections}
            canWritePower={canWritePower}
          />
        )}
        {!hasPorts && projection.capacity === 0 && (
          <div className="equipment-physical-no-content">
            <strong>{t('empty')}</strong>
            <span>{t('noVirtual')}</span>
            {onAdd && root.childMode === 'DYNAMIC' && (
              <button type="button" onClick={() => onAdd(null)}>
                {t('addEquipment')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
