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
  const primaryInventory = view.inventory[0];

  const occupiedBlocks = blocks.filter((block) => block.role === 'PHYSICAL');
  const vacantBlocks = blocks.filter((block) => block.role === 'AVAILABLE');

  return (
    <section className="legacy-rack-view">
      <aside className="legacy-rack-internal">
        <header>
          <span>Rack context</span>
          <strong>Internal Rack Hierarchy</strong>
        </header>

        <div className="legacy-rack-position-card">
          <span>Selected position</span>
          <strong>{context?.positionName ?? 'Rack position'}</strong>
          {context?.coordinate && <small>{context.coordinate}</small>}
        </div>

        <div className="legacy-rack-internal-list">
          {occupiedBlocks.map((block) => (
            <button
              type="button"
              key={block.key}
              className="is-equipped"
              onClick={() => {
                const item = block.occupant
                  ? view.inventory.find((candidate) => candidate.id === block.occupant?.id)
                  : undefined;
                if (item) setSelected(topologyInspector(item));
              }}
            >
              <span className="legacy-rack-tree-dot" />
              <span>
                <strong>
                  U{block.bottomU}–U{block.topU}
                </strong>
                <small>{block.occupant?.name ?? 'Occupied'}</small>
              </span>
            </button>
          ))}
          {vacantBlocks.map((block) => (
            <div key={block.key} className="legacy-rack-internal-vacant">
              <span className="legacy-rack-tree-dot" />
              <span>
                <strong>
                  U{block.bottomU}–U{block.topU}
                </strong>
                <small>{block.units}U available</small>
              </span>
            </div>
          ))}
        </div>
      </aside>

      <div className="legacy-rack-main">
        <SectionHeader
          eyebrow="Rack / physical elevation"
          title={view.rack.name}
          description="Front elevation · physical occupancy and clearance"
          actions={
            <>
              <StatusBadge tone="good">ACTIVE</StatusBadge>
              <InspectButton entity={topologyInspector(view.rack)} />
            </>
          }
        />

        <div className="legacy-rack-canvas">
          <div className="legacy-rack-canvas-grid" aria-hidden="true" />
          <div className="legacy-rack-heading">
            <div>
              <strong>{totalU}RU Cabinet</strong>
              <span>{view.rack.variant}</span>
            </div>
            <small>{view.rack.name}</small>
          </div>

          <div className="legacy-rack-frame">
            <div className="legacy-rack-metal legacy-rack-metal--top">
              <span />
            </div>
            <div className="legacy-rack-units">
              {blocks.map((block) => {
                const item = block.occupant
                  ? view.inventory.find((candidate) => candidate.id === block.occupant?.id)
                  : undefined;

                const blockStyle = {
                  '--rack-block-units': block.units,
                  minHeight: `max(${block.units * 3}px, ${block.units === 1 ? 18 : 26}px)`,
                } as CSSProperties;

                const content = (
                  <>
                    <span className="legacy-rack-scale">
                      <b>{block.topU}</b>
                      {block.units > 1 && <b>{block.bottomU}</b>}
                    </span>
                    <span className="legacy-rack-block-copy">
                      <strong>{block.occupant?.name ?? roleLabel(block.role)}</strong>
                      <small>
                        {block.occupant?.kind
                          ? `${block.occupant.kind} · ${block.units}RU`
                          : `${block.units}RU ${roleLabel(block.role)}`}
                      </small>
                    </span>
                    {block.role === 'PHYSICAL' && <span className="legacy-rack-led">● ACTIVE</span>}
                  </>
                );

                return item && inventoryLinks[item.id] ? (
                  <Link
                    key={block.key}
                    className={`legacy-rack-block legacy-rack-block--${block.role.toLowerCase()}`}
                    style={blockStyle}
                    href={inventoryLinks[item.id]}
                    aria-label={`Open ${item.name}`}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={block.key}
                    className={`legacy-rack-block legacy-rack-block--${block.role.toLowerCase()}`}
                    style={blockStyle}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
            <div className="legacy-rack-metal legacy-rack-metal--bottom">
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>

      <aside className="legacy-rack-properties">
        <div className="legacy-properties-header">
          <span>Rack details</span>
          <strong>{view.rack.name}</strong>
          <StatusBadge tone="good">OK · HEALTHY</StatusBadge>
        </div>

        <section className="legacy-property-section">
          <div className="legacy-property-title">
            <span>RU Usage</span>
            <strong>
              {physical} / {totalU} U
            </strong>
          </div>
          <div className="legacy-progress">
            <span style={{ width: `${usedPercent}%` }} />
          </div>
          <small>{usedPercent}% occupied capacity</small>
        </section>

        <section className="legacy-property-section">
          <h3>Capacity state</h3>
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
        </section>

        <section className="legacy-property-section">
          <h3>Mounted identities</h3>
          {view.inventory.length === 0 ? (
            <p>No mounted inventory.</p>
          ) : (
            <div className="legacy-rack-inventory-list">
              {view.inventory.map((item) =>
                inventoryLinks[item.id] ? (
                  <Link key={item.id} href={inventoryLinks[item.id]}>
                    <span>
                      <small>{item.kind}</small>
                      <strong>{item.name}</strong>
                    </span>
                    <b>Open device →</b>
                  </Link>
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(topologyInspector(item))}
                  >
                    <span>
                      <small>{item.kind}</small>
                      <strong>{item.name}</strong>
                    </span>
                    <b>Inspect →</b>
                  </button>
                ),
              )}
            </div>
          )}
        </section>

        {primaryInventory && (
          <div className="legacy-properties-actions">
            {inventoryLinks[primaryInventory.id] && (
              <Link className="action-link" href={inventoryLinks[primaryInventory.id]}>
                Open mounted device →
              </Link>
            )}
            <button type="button" onClick={() => setSelected(topologyInspector(primaryInventory))}>
              Inspect mounted device
            </button>
          </div>
        )}
      </aside>

      {selected && <EntityInspector entity={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
