'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { EquipmentNode } from '@/modules/topology/domain/entities';

interface Props {
  root: EquipmentNode;
  equipment: readonly EquipmentNode[];
  onAdd?: (slot: number | null) => void;
}

const frameStyle: CSSProperties = {
  border: '2px solid #64748b', borderRadius: 8, padding: 12,
  background: '#f6f3e5', minWidth: 0, overflowWrap: 'anywhere',
};
const headStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 };

export function PhysicalEquipmentDiagram({ root, equipment, onAdd }: Props) {
  const byId = useMemo(() => new Map(equipment.map(item => [item.id, item])), [equipment]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  function toggle(id: string) {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function render(node: EquipmentNode, depth: number, ancestry: ReadonlySet<string>): ReactNode {
    if (ancestry.has(node.id)) return <p role="alert">Equipment hierarchy cycle detected.</p>;
    const visited = new Set(ancestry);
    visited.add(node.id);
    const occupied = node.children.filter(Boolean).length;
    const count = node.children.length;
    const type = node.equipmentType;
    const isPanel = type === 'PANEL';
    const isLeaf = count === 0;
    const policy = node.presentation?.childrenVisibility ?? 'AUTO';
    const collapse = count > 4 && policy !== 'INLINE' && !expanded.has(node.id);
    const limit = node.presentation?.maxPerLine ?? (isPanel ? 12 : count);
    const columns = Math.max(1, Math.min(12, limit || 1));
    const direction = node.presentation?.direction ?? 'ROW';
    const gridStyle: CSSProperties = {
      display: 'grid',
      gridTemplateColumns: direction === 'COLUMN'
        ? 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))'
        : `repeat(${columns}, minmax(0, 1fr))`,
      ...(direction === 'COLUMN' ? { gridAutoFlow: 'column', gridTemplateRows: `repeat(${Math.max(1, Math.ceil(count / columns))}, auto)` } : {}),
      gap: isPanel ? 4 : 10,
      overflowX: 'auto',
    };
    return (
      <section key={node.id} className="equipment-physical-box" style={{ ...frameStyle, background: depth === 0 ? '#edf0e6' : depth === 1 ? '#e9f5e8' : '#fff5e6' }}>
        <header style={headStyle}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1 }}>{type.replaceAll('_', ' ')} · EQUIPMENT</div>
            <strong style={{ display: 'block' }}>{node.name}</strong>
            <small>{occupied} / {count} occupied {node.childMode === 'POSITIONAL' ? 'positions' : 'children'}</small>
          </div>
          <Link href={'/device/' + encodeURIComponent(node.id)} style={{ fontSize: 12 }}>OPEN DETAILS ↗</Link>
        </header>
        {isLeaf ? (
          <p style={{ margin: 0, fontSize: 12 }}>
            {node.accessPorts.filter(port => port.lifecycle === 'ACTIVE').length} access ports · Leaf equipment
          </p>
        ) : collapse ? (
          <button type="button" onClick={() => toggle(node.id)}>
            EXPLORE {count} POSITIONS · {occupied} OCCUPIED
          </button>
        ) : (
          <>
            <div className={isPanel ? 'equipment-physical-slots' : 'equipment-physical-children'} style={gridStyle}>
              {node.children.map((id, index) => {
                const child = id ? byId.get(id) : undefined;
                if (child) {
                  return (
                    <div key={index} style={{ minWidth: 0 }}>
                      {isPanel ? (
                        <Link title={child.name} href={'/device/' + encodeURIComponent(child.id)}
                          style={{ display: 'block', minHeight: 46, padding: 5, background: '#d1e8eb', border: '1px solid #4a7581', textDecoration: 'none', color: '#183943', fontSize: 10 }}>
                          <b>{String(index + 1).padStart(2, '0')}</b>
                          <span style={{ display: 'block' }}>{child.equipmentType.replaceAll('_', ' ')}</span>
                        </Link>
                      ) : render(child, depth + 1, visited)}
                    </div>
                  );
                }
                return (
                  <div key={index} title={id ? 'Referenced Equipment unavailable' : 'Available position'}
                    style={{ border: '1px dashed #9aa8ad', padding: isPanel ? 4 : 12, minHeight: isPanel ? 36 : 96, fontSize: 11, background: '#fffefa' }}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    {!isPanel && <p>{id ? 'Missing reference' : 'AVAILABLE'}</p>}
                    {depth === 0 && onAdd && !id && <button type="button" onClick={() => onAdd(index)}>+ ADD</button>}
                  </div>
                );
              })}
            </div>
            {count > 4 && policy !== 'INLINE' && (
              <button type="button" onClick={() => toggle(node.id)} style={{ marginTop: 12 }}>COLLAPSE POSITIONS</button>
            )}
          </>
        )}
      </section>
    );
  }
  return <div aria-label="Nested physical Equipment diagram">{render(root, 0, new Set())}</div>;
}
