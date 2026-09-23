'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { StructureNode } from '@/modules/topology/domain/entities';
import type { VisualStageChild } from './topology-visual-stage';
import { SpatialAuthoringCanvas } from '@/components/spatial/spatial-authoring-canvas';

export function StructureStudio({ node, levels, canWrite }: Readonly<{node: StructureNode; levels: readonly VisualStageChild[]; canWrite: boolean}>) {
  const [active, setActive] = useState(levels[0]?.node.id);
  const selected = levels.find(item => item.node.id === active);
  return <section className="studio-building">
    <div className="studio-building-plan"><SpatialAuthoringCanvas entityId={node.id} entityName={node.name} entityKind="STRUCTURE" initialPolygon={node.polygon ?? []} canWrite={canWrite} title="Building footprint" subtitle="Site coordinates · millimetres" /></div>
    <aside className="studio-building-stack"><header><small>BUILDING LEVELS</small><h2>{node.name}</h2><p>Schematic stack · floor heights unspecified</p></header>
      <div className="studio-floor-stack">{[...levels].reverse().map(({node: level, href}) => <button key={level.id} className={level.id === active ? 'is-active' : ''} aria-pressed={level.id === active} onClick={() => setActive(level.id)} onDoubleClick={() => {window.location.href=href;}}><span>LEVEL</span><strong>{level.name}</strong><span>↗</span></button>)}</div>
      {selected ? <Link className="action-link" href={selected.href}>Open {selected.node.name} →</Link> : <p>No levels configured.</p>}
    </aside>
  </section>;
}
