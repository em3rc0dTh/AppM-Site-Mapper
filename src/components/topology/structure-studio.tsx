'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { StructureNode } from '@/modules/topology/domain/entities';
import type { VisualStageChild } from './topology-visual-stage';

export interface StructureLevelEntry extends VisualStageChild {
  readonly containedCount: number;
  readonly containedNames: readonly string[];
}
import { SpatialAuthoringCanvas } from '@/components/spatial/spatial-authoring-canvas';

export function StructureStudio({
  node,
  levels,
  canWrite,
}: Readonly<{ node: StructureNode; levels: readonly StructureLevelEntry[]; canWrite: boolean }>) {
  const orderedLevels = [...levels].sort((left, right) =>
    new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare(
      right.node.name,
      left.node.name,
    ),
  );
  const [active, setActive] = useState(orderedLevels.at(-1)?.node.id ?? orderedLevels[0]?.node.id);
  const selected = orderedLevels.find((item) => item.node.id === active);
  return (
    <section className="studio-building">
      <div className="studio-building-plan">
        <SpatialAuthoringCanvas
          entityId={node.id}
          entityName={node.name}
          entityKind="STRUCTURE"
          initialPolygon={node.polygon ?? []}
          canWrite={canWrite}
          title="Building footprint"
          subtitle="Site coordinates · millimetres"
        />
      </div>
      <aside className="studio-building-stack">
        <header>
          <small>BUILDING LEVELS</small>
          <h2>{node.name}</h2>
          <p>Schematic stack · floor heights unspecified</p>
        </header>
        <div className="studio-floor-stack">
          {orderedLevels.map(({ node: level, href, containedCount, containedNames }) => (
            <button
              key={level.id}
              className={level.id === active ? 'is-active' : ''}
              aria-pressed={level.id === active}
              onClick={() => setActive(level.id)}
              onDoubleClick={() => {
                window.location.href = href;
              }}
            >
              <span className="studio-floor-kind">LEVEL</span>
              <span className="studio-floor-copy">
                <strong>{level.name}</strong>
                <small className={containedCount > 0 ? 'has-content' : 'is-empty'}>
                  {containedCount > 0
                    ? `${containedCount} room${containedCount === 1 ? '' : 's'}`
                    : 'EMPTY · 0 ROOMS'}
                </small>
                {containedCount > 0 && (
                  <small className="studio-floor-preview">
                    {containedNames.slice(0, 2).join(' · ')}
                    {containedNames.length > 2 ? ` · +${containedNames.length - 2}` : ''}
                  </small>
                )}
              </span>
              <span className="studio-floor-enter">↗</span>
            </button>
          ))}
        </div>
        {selected ? (
          <Link className="action-link" href={selected.href}>
            Open {selected.node.name} · {selected.containedCount}{' '}
            {selected.containedCount === 1 ? 'room' : 'rooms'} →
          </Link>
        ) : (
          <p>No levels configured.</p>
        )}
      </aside>
    </section>
  );
}
