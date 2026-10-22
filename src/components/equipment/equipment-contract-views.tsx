'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { EquipmentNode } from '@/modules/topology/domain/entities';
import type { CompositionBreakerTelemetry } from '@/modules/telemetry/domain/composition-breaker-telemetry';
import { projectCompositionTelemetry } from '@/modules/telemetry/application/composition-telemetry-summary';

interface Props {
  readonly root: EquipmentNode;
  readonly equipmentById: ReadonlyMap<string, EquipmentNode>;
  readonly readings: Readonly<Record<string, CompositionBreakerTelemetry>>;
  readonly onAdd?: (slot: number | null) => void;
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
}: Readonly<{ node: EquipmentNode; children?: React.ReactNode; className?: string }>) {
  return (
    <Link className={className} href={destination(node.id)}>
      {children ?? node.name}
      <span className="ec-open" aria-hidden="true">↗</span>
    </Link>
  );
}

function PanelPreview({
  panel,
  byId,
}: Readonly<{ panel: EquipmentNode; byId: ReadonlyMap<string, EquipmentNode> }>) {
  const summary = projectCompositionTelemetry(panel, byId, {});
  return (
    <ChildLink node={panel} className="ec-panel-line">
      <span className="ec-panel-name">{panel.name}</span>
      <Counts node={panel} />
      <span className="ec-panel-presence">
        {summary.installed ? `${summary.installed} installed` : 'Available'}
      </span>
    </ChildLink>
  );
}

function FramePreview({
  frame,
  byId,
}: Readonly<{ frame: EquipmentNode; byId: ReadonlyMap<string, EquipmentNode> }>) {
  const panels = activeChildren(frame, byId).filter(({ child }) => child.equipmentType === 'PANEL');
  return (
    <article className="ec-frame-card">
      <div className="ec-frame-heading">
        <div>
          <small>FRAME</small>
          <ChildLink node={frame} className="ec-frame-title" />
        </div>
        <span className="ec-count">{panels.length} panels</span>
      </div>
      <div className="ec-frame-panels">
        {panels.length ? panels.map(({ child }) => (
          <PanelPreview key={child.id} panel={child} byId={byId} />
        )) : <p className="ec-muted">No panels installed</p>}
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
      <span className="ec-breaker-name" title={breaker.name}>{breaker.name}</span>
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
  const [showSlots, setShowSlots] = useState(false);
  const slots = root.children.map((id, index) => ({
    id,
    index,
    child: id ? byId.get(id) : undefined,
  }));
  const installed = slots.filter((slot) => Boolean(slot.id));
  const available = root.childMode === 'POSITIONAL'
    ? slots.filter((slot) => slot.id === null)
    : [];
  return (
    <section className="ec-panel-composition" aria-label="Installed breakers and available slots">
      <header className="ec-section-heading">
        <div>
          <small>PHYSICAL PANEL</small>
          <strong>Installed circuits</strong>
        </div>
        <div className="ec-heading-counts">
          <span>{installed.length} installed</span>
          {root.childMode === 'POSITIONAL' && <span>{available.length} available</span>}
          <span>{slots.length} total</span>
        </div>
      </header>
      <div className="ec-table-scroll" role="region" tabIndex={0} aria-label="Breaker measurements">
        <div className="ec-breaker-table">
          <div className="ec-breaker-columns" aria-hidden="true">
            <span>POS</span><span>BREAKER</span>
            <span>V · V</span><span>I · A</span><span>P · W</span><span>E · kWh</span><span>STATUS</span>
          </div>
          {installed.length ? installed.map(({ id, index, child }) => (
            child?.lifecycle === 'ACTIVE' && child.equipmentType === 'CIRCUIT_BREAKER' ? (
              <BreakerRow key={id} breaker={child} position={index + 1} reading={readings[child.id]} />
            ) : (
              <div className="ec-missing-row" key={id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{child?.name ?? 'Unresolved equipment reference'}</strong>
                <span>{child?.equipmentType ?? 'Not available'}</span>
                {child && <ChildLink node={child}>OPEN EQUIPMENT</ChildLink>}
              </div>
            )
          )) : (
            <p className="ec-empty-panel">No breakers installed. Free slots are not offline devices.</p>
          )}
        </div>
      </div>
      {root.childMode === 'POSITIONAL' && (
        <div className="ec-slot-management">
          <div>
            <strong>{available.length} free positions</strong>
            <small>
              {available.length
                ? `P${String(available[0]!.index + 1).padStart(2, '0')}–P${String(available.at(-1)!.index + 1).padStart(2, '0')} · select a slot to install Equipment`
                : 'Every recorded position is occupied'}
            </small>
          </div>
          {available.length > 0 && (
            <button
              type="button"
              aria-expanded={showSlots}
              aria-controls="ec-available-slots"
              onClick={() => setShowSlots((value) => !value)}
            >
              {showSlots ? 'HIDE SLOTS' : 'VIEW SLOTS'}
            </button>
          )}
          {onAdd && available.length > 0 && (
            <button type="button" className="ec-primary-action" onClick={() => onAdd(available[0]!.index)}>
              + ADD
            </button>
          )}
        </div>
      )}
      {showSlots && available.length > 0 && (
        <div className="ec-slot-grid" id="ec-available-slots" aria-label="Available positions">
          {available.map(({ index }) => (
            <button
              type="button"
              key={index}
              disabled={!onAdd}
              onClick={() => onAdd?.(index)}
              aria-label={`Install Equipment in position ${index + 1}`}
            >
              <b>{String(index + 1).padStart(2, '0')}</b>
              <span>Available</span>
              {onAdd && <span aria-hidden="true">+</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function EquipmentContractViews({ root, equipmentById, readings, onAdd }: Props) {
  const children = activeChildren(root, equipmentById);
  const summary = projectCompositionTelemetry(root, equipmentById, readings);
  const type = root.equipmentType;
  return (
    <div className="ec-contract" data-equipment-type={type}>
      <div className="ec-topline">
        <span className="ec-eyebrow">PHYSICAL COMPOSITION <span aria-hidden="true">/</span> {type.replaceAll('_', ' ')}</span>
        <span className="ec-topline-status">
          <span className="ec-status-dot" aria-hidden="true" /> {summary.reporting}/{summary.installed} breakers reporting
        </span>
      </div>
      <div className="ec-focus">
        <div>
          <small>FOCUSED EQUIPMENT</small>
          <h2>{root.name}</h2>
          <p>{root.model ?? root.equipmentType.replaceAll('_', ' ')} · {root.childMode === 'POSITIONAL' ? `${root.children.length} physical positions` : `${children.length} child Equipment`}</p>
        </div>
        <div className="ec-focus-badges">
          <span>{children.length} installed</span>
          <span>{root.accessPorts.filter((port) => port.lifecycle === 'ACTIVE').length} ports</span>
        </div>
      </div>

      {type === 'CHASSIS' && (
        <section className="ec-main-section" aria-label="Chassis shelves">
          <header className="ec-section-heading"><div><small>CHASSIS INTERIOR</small><strong>Shelves &amp; frames</strong></div><span>{children.length} child assemblies</span></header>
          <div className="ec-chassis-shelves">
            {children.length ? children.map(({ child }) => (
              <article className="ec-shelf-card" key={child.id}>
                <div className="ec-shelf-card-heading">
                  <div><small>{child.equipmentType.replaceAll('_', ' ')}</small><ChildLink node={child} className="ec-shelf-link" /></div>
                  <Counts node={child} />
                </div>
                <div className="ec-chassis-frame-strip">
                  {activeChildren(child, equipmentById).length
                    ? activeChildren(child, equipmentById).map(({ child: frame }) => (
                      <ChildLink node={frame} key={frame.id} className="ec-chassis-frame">
                        <strong>{frame.name}</strong><small><Counts node={frame} /></small>
                      </ChildLink>
                    ))
                    : child.equipmentType === 'FRAME'
                      ? activeChildren(child, equipmentById).map(({ child: panel }) => (
                        <PanelPreview key={panel.id} panel={panel} byId={equipmentById} />
                      ))
                      : <span className="ec-muted">No installed child Equipment</span>}
                </div>
              </article>
            )) : <p className="ec-muted">No shelves recorded in this chassis</p>}
          </div>
        </section>
      )}

      {(type === 'SHELF' || type === 'SUB_SHELF') && (
        <section className="ec-main-section" aria-label="Shelf frames">
          <header className="ec-section-heading"><div><small>SHELF STRUCTURE</small><strong>Frames</strong></div><span>{children.length} frames recorded</span></header>
          <div className="ec-frames-grid">
            {children.map(({ child }) => <FramePreview key={child.id} frame={child} byId={equipmentById} />)}
            {!children.length && <p className="ec-muted">No frames recorded</p>}
          </div>
        </section>
      )}

      {type === 'FRAME' && (
        <section className="ec-main-section" aria-label="Frame panels">
          <header className="ec-section-heading"><div><small>FRAME INTERIOR</small><strong>Panels</strong></div><span>{children.length} panels recorded</span></header>
          <div className="ec-frame-rows">
            {children.map(({ child, position }) => (
              <div className="ec-frame-row" key={child.id}>
                <span className="ec-pos">{String(position).padStart(2, '0')}</span>
                <div><ChildLink node={child} className="ec-frame-row-name" /><Counts node={child} /></div>
                <span className="ec-count">{projectCompositionTelemetry(child, equipmentById, readings).reporting ? 'With readings' : 'No breaker readings'}</span>
              </div>
            ))}
            {!children.length && <p className="ec-muted">No panels recorded</p>}
          </div>
        </section>
      )}

      {type === 'PANEL' && (
        <PanelComposition root={root} byId={equipmentById} readings={readings} onAdd={onAdd} />
      )}

      {type === 'CIRCUIT_BREAKER' && (
        <section className="ec-breaker-detail" aria-label="Breaker own MQTT telemetry">
          <div className="ec-section-heading">
            <div><small>CIRCUIT BREAKER</small><strong>Own telemetry</strong></div>
            <span className="ec-status" data-status={readings[root.id]?.status ?? 'UNMAPPED'}>
              <span className="ec-status-dot" aria-hidden="true" />{readings[root.id]?.status ?? 'UNMAPPED'}
            </span>
          </div>
          <div className="ec-breaker-metrics"><BreakerMetrics reading={readings[root.id]} /></div>
          <p className="ec-breaker-source">MQTT source: {readings[root.id]?.sourceIdentity ?? 'No verified binding'} · Last packet: {readings[root.id]?.receivedAt ?? '—'}</p>
          <Link className="ec-trace-link" href={`/power?entityId=${encodeURIComponent(root.id)}`}>Explore Power Path ↗</Link>
        </section>
      )}
      <div className="ec-legend" aria-label="Telemetry metric legend">
        <span><b>V</b> Voltage · V</span><span><b>I</b> Current · A</span>
        <span><b>P</b> Power · W</span><span><b>E</b> Accumulated energy counter · kWh</span>
      </div>
    </div>
  );
}
