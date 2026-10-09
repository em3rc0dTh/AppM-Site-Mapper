'use client';

import Link from 'next/link';
import { useMemo, useState, type CSSProperties } from 'react';

import {
  projectEquipmentComposition,
  shouldSummarizeFocus,
} from '@/modules/topology/application/equipment-composition-projection';
import type { AccessPort, EquipmentNode } from '@/modules/topology/domain/entities';

interface Props {
  readonly root: EquipmentNode;
  readonly equipment: readonly EquipmentNode[];
  readonly onAdd?: ((slot: number | null) => void) | undefined;
}

function countLabel(occupied: number, count: number, positional: boolean) {
  return positional ? `${occupied} / ${count} occupied` : `${occupied} installed`;
}

function EquipmentPreview({
  equipment,
  equipmentById,
  slotIndex,
}: Readonly<{
  equipment: EquipmentNode;
  equipmentById: ReadonlyMap<string, EquipmentNode>;
  slotIndex: number;
}>) {
  const composition = projectEquipmentComposition(equipment, equipmentById);
  const ports = equipment.accessPorts.filter((port) => port.lifecycle === 'ACTIVE');
  const preview = composition.capacity > 4 ? [] : composition.slots.filter((slot) => slot.equipment).slice(0, 4);
  return (
    <article className="equipment-physical-preview">
      <div className="equipment-physical-preview-heading">
        <span className="equipment-physical-position">
          POSITION {String(slotIndex + 1).padStart(2, '0')}
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
      <div className="equipment-physical-preview-meta">
        <span>
          {countLabel(composition.occupied, composition.capacity, composition.positional)}
        </span>
        {ports.length > 0 && (
          <span>
            {ports.length} access {ports.length === 1 ? 'port' : 'ports'}
          </span>
        )}
      </div>
      {preview.length > 0 && (
        <div
          className="equipment-physical-preview-children"
          aria-label={equipment.name + ' child preview'}
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
                  {countLabel(
                    childComposition.occupied,
                    childComposition.capacity,
                    childComposition.positional,
                  )}
                </small>
              </Link>
            );
          })}
          {composition.occupied > preview.length && (
            <span className="equipment-physical-preview-more">
              +{composition.occupied - preview.length} more — open to inspect
            </span>
          )}
        </div>
      )}
      {composition.capacity > 4 && (
        <div className="equipment-physical-mini-capacity">
          <span>
            {composition.capacity} {composition.positional ? 'positions' : 'children'} · Open for
            detail
          </span>
        </div>
      )}
    </article>
  );
}

function PortFace({ ports }: Readonly<{ ports: readonly AccessPort[] }>) {
  const active = useMemo(() => ports.filter((port) => port.lifecycle === 'ACTIVE'), [ports]);
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (!active.length) return null;
  const selected = active.find((port) => port.id === selectedPortId);
  const visible = showAll ? active : active.slice(0, 48);

  return (
    <section className="equipment-faceplate" aria-label="Actual physical access ports">
      <header className="equipment-faceplate-header">
        <div>
          <strong>PHYSICAL TERMINALS</strong>
          <span>{active.length} recorded · No unprovisioned ports shown</span>
        </div>
        <span className="equipment-faceplate-status">FRONT / INTERFACE</span>
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
            </button>
          ))}
        </div>
        {active.length > 48 && (
          <button
            className="equipment-faceplate-more"
            type="button"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'SHOW FIRST 48' : `SHOW ALL ${active.length} RECORDED PORTS`}
          </button>
        )}
      </div>
      {selected ? (
        <div
          className="equipment-faceplate-selection"
          role="region"
          aria-label={`Selected port ${selected.name}`}
        >
          <div>
            <small>SELECTED ACCESS PORT</small>
            <strong>{selected.name}</strong>
            <span>
              {selected.portType} · {selected.direction ?? 'Unspecified direction'}
            </span>
          </div>
          <dl>
            <dt>Exposure</dt>
            <dd>{selected.exposure}</dd>
            <dt>Connector</dt>
            <dd>{selected.connectorType || 'Not recorded'}</dd>
            <dt>Protocol</dt>
            <dd>{selected.protocol || 'Not recorded'}</dd>
          </dl>
          <button type="button" onClick={() => setSelectedPortId(null)}>
            CLOSE
          </button>
        </div>
      ) : (
        <p className="equipment-faceplate-hint">
          Select a terminal to inspect its recorded identity. Connections are managed separately.
        </p>
      )}
    </section>
  );
}

export function PhysicalEquipmentDiagram({ root, equipment, onAdd }: Props) {
  const equipmentById = useMemo(
    () => new Map(equipment.map((item) => [item.id, item])),
    [equipment],
  );
  const projection = projectEquipmentComposition(root, equipmentById);
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(48);
  const hasPorts = root.accessPorts.some((port) => port.lifecycle === 'ACTIVE');
  const summarized = !expanded && shouldSummarizeFocus(projection);
  const lineLimit = projection.maxPerLine ?? (projection.positional ? 8 : 2);
  const columns = Math.max(
    1,
    Math.min(projection.capacity || 1, lineLimit, projection.positional ? 12 : 4),
  );
  const slots = projection.slots.slice(0, visibleCount);
  const style = {
    '--composition-columns': columns,
  } as CSSProperties;

  return (
    <div className="equipment-physical-canvas" aria-label="Physical Equipment composition">
      <div className="equipment-physical-shell">
        <header className="equipment-physical-shell-header">
          <div>
            <span>FOCUSED EQUIPMENT</span>
            <strong>{root.name}</strong>
            <small>
              {root.equipmentType.replaceAll('_', ' ')} · {root.childMode}
            </small>
          </div>
          <div className="equipment-physical-shell-stats">
            <span>
              <b>{projection.occupied}</b> Installed
            </span>
            {projection.positional && (
              <span>
                <b>{projection.available}</b> Free positions
              </span>
            )}
            <span>
              <b>{root.accessPorts.filter((port) => port.lifecycle === 'ACTIVE').length}</b> Access
              ports
            </span>
          </div>
        </header>

        {projection.capacity > 0 && (
          <section className="equipment-physical-bays" aria-label="Immediate child composition">
            <header className="equipment-physical-subheading">
              <strong>INTERNAL COMPOSITION</strong>
              <small>
                {countLabel(projection.occupied, projection.capacity, projection.positional)}
              </small>
            </header>
            {summarized ? (
              <div className="equipment-physical-summary">
                <p>
                  {projection.capacity} immediate {projection.positional ? 'positions' : 'children'}{' '}
                  · {projection.occupied} occupied.
                </p>
                <button type="button" onClick={() => setExpanded(true)}>
                  EXPLORE COMPOSITION
                </button>
              </div>
            ) : (
              <>
                <div
                  className={`equipment-physical-children ${projection.direction === 'COLUMN' ? 'is-column' : 'is-row'} ${projection.positional && projection.capacity > 4 ? 'is-dense' : ''}`}
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
                          </Link>
                        ) : (
                          <EquipmentPreview
                            equipment={slot.equipment}
                            equipmentById={equipmentById}
                            slotIndex={slot.index}
                          />
                        )
                      ) : (
                        <div
                          className={`equipment-physical-empty ${projection.positional && projection.capacity > 4 ? 'is-dense' : ''}`}
                        >
                          <small>POSITION {String(slot.index + 1).padStart(2, '0')}</small>
                          <span>
                            {slot.equipmentId ? 'Missing equipment reference' : 'Available'}
                          </span>
                          {!slot.equipmentId && onAdd && (
                            <button
                              type="button"
                              onClick={() => onAdd(projection.positional ? slot.index : null)}
                              aria-label={`Add Equipment in position ${slot.index + 1}`}
                            >
                              + ADD
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
                    SHOW NEXT {Math.min(48, projection.capacity - visibleCount)} POSITIONS
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
                    BACK TO SUMMARY
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {hasPorts && <PortFace ports={root.accessPorts} />}
        {!hasPorts && projection.capacity === 0 && (
          <div className="equipment-physical-no-content">
            <strong>No internal Equipment or Access Ports installed</strong>
            <span>
              The physical view reflects recorded inventory; it does not create virtual ports or
              modules.
            </span>
            {onAdd && root.childMode === 'DYNAMIC' && (
              <button type="button" onClick={() => onAdd(null)}>
                + ADD EQUIPMENT
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
