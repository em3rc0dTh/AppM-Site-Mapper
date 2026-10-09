'use client';

import Link from 'next/link';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import type { AccessPort, EquipmentNode } from '@/modules/topology/domain/entities';

interface Props {
  readonly root: EquipmentNode;
  readonly equipment: readonly EquipmentNode[];
  readonly onAdd?: (slot: number | null) => void;
}

const sectionStyle: CSSProperties = {
  minWidth: 0,
  width: '100%',
  boxSizing: 'border-box',
  border: '2px solid #7b8d96',
  borderRadius: 7,
  padding: 'clamp(9px, 1.4vw, 18px)',
  background: '#fff5dc',
};

function PortTerminals({ ports }: { readonly ports: readonly AccessPort[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const active = ports.filter((port) => port.lifecycle === 'ACTIVE');
  const selected = active.find((port) => port.id === selectedId);
  if (!active.length) return null;

  return (
    <div className="equipment-port-terminals" aria-label="Access ports">
      <div className="equipment-port-terminal-list">
        {active.map((port) => (
          <button
            key={port.id}
            type="button"
            aria-pressed={selectedId === port.id}
            title={port.name}
            onClick={() => setSelectedId((value) => (value === port.id ? null : port.id))}
          >
            <span aria-hidden="true">●</span> {port.name} · {port.portType}
          </button>
        ))}
      </div>
      {selected && (
        <dl className="equipment-port-detail">
          <dt>Port</dt><dd>{selected.name}</dd>
          <dt>Type</dt><dd>{selected.portType}</dd>
          <dt>Direction</dt><dd>{selected.direction ?? 'Unspecified'}</dd>
          <dt>Exposure</dt><dd>{selected.exposure}</dd>
          <dt>Connector</dt><dd>{selected.connectorType ?? 'Not configured'}</dd>
          <dt>Protocol</dt><dd>{selected.protocol ?? 'Not configured'}</dd>
        </dl>
      )}
    </div>
  );
}

export function PhysicalEquipmentDiagram({ root, equipment, onAdd }: Props) {
  const byId = useMemo(() => new Map(equipment.map((item) => [item.id, item])), [equipment]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  function toggle(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function render(node: EquipmentNode, depth: number, ancestry: ReadonlySet<string>): ReactNode {
    if (ancestry.has(node.id)) return <p role="alert">Equipment hierarchy cycle detected.</p>;
    const visited = new Set(ancestry);
    visited.add(node.id);
    const count = node.children.length;
    const occupied = node.children.filter(Boolean).length;
    const positional = node.childMode === 'POSITIONAL';
    const policy = node.presentation?.childrenVisibility ?? 'AUTO';
    const dense = positional && count > 4;
    const collapsed = !expanded.has(node.id) &&
      (policy === 'SUMMARY' || (policy === 'AUTO' && count > 4));
    const direction = node.presentation?.direction ?? 'ROW';
    const lineLimit = node.presentation?.maxPerLine ?? (dense ? 12 : count);
    const columns = Math.max(1, Math.min(lineLimit, count || 1, dense ? 12 : 4));
    const occupiedSlots = node.children.map((id, index) => ({ id, index }));
    const positionPreview = (
      <div className="equipment-physical-slot-preview" aria-label={`${occupied} of ${count} positions occupied`}>
        {occupiedSlots.slice(0, 48).map(({ id, index }) => (
          <span
            key={index}
            className={id ? 'is-occupied' : ''}
            title={`Position ${index + 1}: ${id ? byId.get(id)?.name ?? 'Occupied' : 'Available'}`}
          />
        ))}
        {count > 48 && <small>+{count - 48} positions</small>}
      </div>
    );

    return (
      <section
        key={node.id}
        className="equipment-physical-box"
        style={{ ...sectionStyle, background: depth === 0 ? '#eaf2e6' : depth === 1 ? '#f0f4e8' : '#fff2d5' }}
      >
        <header className="equipment-physical-header">
          <div>
            <small>{node.equipmentType.replaceAll('_', ' ')} · EQUIPMENT</small>
            <strong>{node.name}</strong>
            <span>{positional ? `${occupied} / ${count} positions` : `${occupied} children`}</span>
          </div>
          <Link href={'/device/' + encodeURIComponent(node.id)}>OPEN DETAILS ↗</Link>
        </header>

        {count === 0 ? (
          <PortTerminals ports={node.accessPorts} />
        ) : collapsed ? (
          <div className="equipment-physical-summary">
            {dense && positionPreview}
            <button type="button" onClick={() => toggle(node.id)}>
              EXPLORE {count} {positional ? 'POSITIONS' : 'CHILDREN'} · {occupied} OCCUPIED
            </button>
          </div>
        ) : (
          <>
            <div
              className={dense ? 'equipment-physical-slots' : `equipment-physical-children ${direction === 'COLUMN' ? 'is-column' : 'is-row'}`}
              style={{
                '--composition-columns': columns,
                '--composition-direction': direction,
              } as CSSProperties}
            >
              {occupiedSlots.map(({ id, index }) => {
                const child = id ? byId.get(id) : undefined;
                if (dense) {
                  return (
                    <div key={index} className={id ? 'equipment-physical-slot is-occupied' : 'equipment-physical-slot'}>
                      <small>{String(index + 1).padStart(2, '0')}</small>
                      {child ? (
                        <Link href={'/device/' + encodeURIComponent(child.id)}>
                          {child.name}
                        </Link>
                      ) : id ? <span>Missing reference</span> : <span>Available</span>}
                      {depth === 0 && !id && onAdd && <button type="button" onClick={() => onAdd(index)}>+ ADD</button>}
                    </div>
                  );
                }

                if (child) return <div key={index} className="equipment-physical-child">{render(child, depth + 1, visited)}</div>;
                return (
                  <div key={index} className="equipment-physical-empty">
                    <small>POSITION {String(index + 1).padStart(2, '0')}</small>
                    <span>{id ? 'Referenced Equipment unavailable' : 'Available'}</span>
                    {depth === 0 && !id && onAdd && <button type="button" onClick={() => onAdd(index)}>+ ADD EQUIPMENT</button>}
                  </div>
                );
              })}
            </div>
            {policy !== 'INLINE' && count > 4 && (
              <button className="equipment-physical-collapse" type="button" onClick={() => toggle(node.id)}>
                COLLAPSE POSITIONS
              </button>
            )}
            <PortTerminals ports={node.accessPorts} />
          </>
        )}
      </section>
    );
  }

  return (
    <div className="equipment-physical-canvas" aria-label="Nested physical Equipment diagram">
      {render(root, 0, new Set())}
    </div>
  );
}
