'use client';

import Link from 'next/link';
import { useMemo, useState, type CSSProperties } from 'react';

import type { RackElevationView } from '@/modules/rack/application/rack-elevation-service';
import { topologyInspector } from '@/shared/ui/entity-adapters';
import { EntityInspector, InspectButton, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { SectionHeader, StatusBadge } from '@/shared/ui/primitives';

interface RackBlock {
  readonly key: string;
  readonly role: string;
  readonly topU: number;
  readonly bottomU: number;
  readonly units: number;
  readonly occupant: RackElevationView['rows'][number]['occupant'];
}

function buildBlocks(view: RackElevationView): RackBlock[] {
  const blocks: RackBlock[] = [];

  for (const row of view.rows) {
    const occupantId = row.occupant?.id ?? '';
    const previous = blocks.at(-1);

    if (
      previous &&
      previous.role === row.role &&
      (previous.occupant?.id ?? '') === occupantId &&
      previous.bottomU - 1 === row.u
    ) {
      blocks[blocks.length - 1] = {
        ...previous,
        bottomU: row.u,
        units: previous.units + 1,
      };
      continue;
    }

    blocks.push({
      key: `${row.role}-${occupantId || 'empty'}-${row.u}`,
      role: row.role,
      topU: row.u,
      bottomU: row.u,
      units: 1,
      occupant: row.occupant,
    });
  }

  return blocks;
}

function roleLabel(role: string) {
  if (role === 'PHYSICAL') return 'EQUIPPED';
  return role;
}

export interface RackElevationContext {
  readonly positionName?: string;
  readonly coordinate?: string;
}

export function RackElevation({
  view,
  context,
  inventoryLinks,
}: Readonly<{
  view: RackElevationView;
  context?: RackElevationContext;
  inventoryLinks: Readonly<Record<string, string>>;
}>) {
  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  const blocks = useMemo(() => buildBlocks(view), [view]);
  const count = (role: string) => view.rows.filter((row) => row.role === role).length;
  const physical = count('PHYSICAL');
  const reserved = count('RESERVED');
  const clearance = count('CLEARANCE');
  const available = count('AVAILABLE');
  const totalU = view.rack.totalU ?? view.rows.length;
  const usedPercent = Math.round((physical / Math.max(totalU, 1)) * 100);
  return (
    <section className="rack-operation">
      <SectionHeader
        eyebrow="Container rack / physical elevation"
        title={view.rack.name}
        description={`${context?.positionName ?? 'Rack'}${context?.coordinate ? ` · ${context.coordinate}` : ''} · ${view.inventory.length} contained`}
        actions={
          <>
            <StatusBadge>{view.rack.lifecycle}</StatusBadge>
            <InspectButton entity={topologyInspector(view.rack)} />
          </>
        }
      />
      <div className="rack-operation-body">
        <div className="rack-cabinet" aria-label={`${totalU} U rack elevation`}>
          <div className="rack-cap">{totalU} U · FRONT ELEVATION</div>
          <div className="rack-bands">
            {blocks.map((block) => {
              const item = block.occupant
                ? view.inventory.find((candidate) => candidate.id === block.occupant?.id)
                : undefined;
              const href = item ? inventoryLinks[item.id] : undefined;
              const style = { flexGrow: block.units } as CSSProperties;
              const content = (
                <>
                  <span className="rack-scale">
                    {block.topU}
                    {block.units > 1 && <span>{block.bottomU}</span>}
                  </span>
                  <span className="rack-band-copy">
                    <strong>{block.occupant?.name ?? roleLabel(block.role)}</strong>
                    <small>
                      {block.units} U · {roleLabel(block.role)}
                    </small>
                  </span>
                  {item && <span aria-hidden="true">→</span>}
                </>
              );
              return item && href ? (
                <Link
                  key={block.key}
                  className={`rack-band rack-band--${block.role.toLowerCase()}`}
                  style={style}
                  href={href}
                  aria-label={`Open ${item.name}`}
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={block.key}
                  className={`rack-band rack-band--${block.role.toLowerCase()}`}
                  style={style}
                >
                  {content}
                </div>
              );
            })}
          </div>
          <div className="rack-cap">PHYSICAL OCCUPANCY</div>
        </div>
        <aside className="rack-summary" aria-label="Capacity and inventory">
          <h2>CAS / capacity</h2>
          <p>{usedPercent}% physically occupied</p>
          <dl>
            <div>
              <dt>Physical</dt>
              <dd>{physical} U</dd>
            </div>
            <div>
              <dt>Reserved</dt>
              <dd>{reserved} U</dd>
            </div>
            <div>
              <dt>Clearance</dt>
              <dd>{clearance} U</dd>
            </div>
            <div>
              <dt>Available</dt>
              <dd>{available} U</dd>
            </div>
          </dl>
          <h2>Contained inventory · {view.inventory.length}</h2>
          {view.inventory.map((item) => (
            <div className="rack-inventory-item" key={item.id}>
              <small>
                {item.kind} · {item.lifecycle}
              </small>
              <strong>{item.name}</strong>
              <span>
                {occupiedBlocksFor(item.id) ? 'Mounted in elevation' : 'No physical mount recorded'}
              </span>
              {inventoryLinks[item.id] && (
                <Link href={inventoryLinks[item.id]!}>Open {item.kind.toLowerCase()} →</Link>
              )}
              <button type="button" onClick={() => setSelected(topologyInspector(item))}>
                Inspect {item.name}
              </button>
            </div>
          ))}
        </aside>
      </div>
      {selected && <EntityInspector entity={selected} onClose={() => setSelected(null)} />}
    </section>
  );

  function occupiedBlocksFor(id: string) {
    return blocks.some((block) => block.role === 'PHYSICAL' && block.occupant?.id === id);
  }
}
