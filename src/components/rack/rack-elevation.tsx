'use client';

import Link from 'next/link';
import { useMemo, useState, type CSSProperties } from 'react';

import type { RackElevationView } from '@/modules/rack/application/rack-elevation-service';

interface RackBlock {
  readonly key: string;
  readonly role: RackElevationView['rows'][number]['role'];
  readonly topU: number;
  readonly bottomU: number;
  readonly units: number;
  readonly allocationId: string;
  readonly occupant: RackElevationView['rows'][number]['occupant'];
}

export interface RackLocationItem {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly href: string;
}

export interface RackElevationContext {
  readonly trail: readonly RackLocationItem[];
  readonly inventoryHrefs: Readonly<Record<string, string>>;
}

function buildBlocks(view: RackElevationView): RackBlock[] {
  const blocks: RackBlock[] = [];

  for (const row of view.rows) {
    const occupantId = row.occupant?.id ?? '';
    const previous = blocks.at(-1);

    if (
      previous &&
      previous.role === row.role &&
      previous.allocationId === row.allocationId &&
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
      key: `${row.allocationId}-${row.role}-${row.u}`,
      role: row.role,
      topU: row.u,
      bottomU: row.u,
      units: 1,
      allocationId: row.allocationId,
      occupant: row.occupant,
    });
  }

  return blocks;
}

function kindLabel(kind: string): string {
  return kind.replaceAll('_', ' ');
}

function locationIcon(kind: string): string {
  switch (kind) {
    case 'SITE':
      return '📍';
    case 'STRUCTURE':
      return '🏢';
    case 'ROOM_SUBSTRUCTURE':
      return '🚪';
    case 'CONTAINER_CLUSTER_BAY':
      return '◆';
    case 'POSITION':
      return '◇';
    default:
      return '·';
  }
}

export function RackElevation({
  view,
  context,
}: Readonly<{ view: RackElevationView; context: RackElevationContext }>) {
  const blocks = useMemo(() => buildBlocks(view), [view]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const totalU = view.rack.totalU ?? view.rows.length;
  const selectedBlock = blocks.find((block) => block.key === selectedKey) ?? null;
  const equippedBlocks = blocks.filter((block) => block.role === 'PHYSICAL' && block.occupant);
  const availableU = view.rows.filter((row) => row.role === 'AVAILABLE').length;
  const reservedU = view.rows.filter((row) => row.role === 'RESERVED').length;
  const equippedU = view.rows.filter((row) => row.role === 'PHYSICAL').length;

  const selectedRange = selectedBlock
    ? view.rack.cas.find((range) => range.id === selectedBlock.allocationId)
    : undefined;

  return (
    <section className="zip-rack-audit">
      <aside className="zip-rack-context">
        <section className="zip-audit-location">
          <h2>LOCATION CONTEXT</h2>
          <ol>
            {context.trail
              .filter((item) =>
                [
                  'SITE',
                  'STRUCTURE',
                  'ROOM_SUBSTRUCTURE',
                  'CONTAINER_CLUSTER_BAY',
                  'POSITION',
                ].includes(item.kind),
              )
              .map((item) => (
                <li key={item.id}>
                  <span aria-hidden="true">{locationIcon(item.kind)}</span>
                  <Link href={item.href}>{item.name}</Link>
                </li>
              ))}
          </ol>
        </section>

        <section className="zip-rack-cas-tree">
          <header>
            <h2>CAS — {totalU}U RACK</h2>
            <p>
              {availableU} AVAIL · {reservedU} RES · {equippedBlocks.length} EQ
            </p>
          </header>

          <button
            type="button"
            className="zip-rack-root is-active"
            onClick={() => setSelectedKey(null)}
          >
            <span className="zip-tree-dot" />
            <strong>{view.rack.name}</strong>
          </button>

          <div className="zip-rack-cas-list">
            {equippedBlocks.map((block) => (
              <button
                type="button"
                key={block.key}
                className={selectedKey === block.key ? 'is-selected' : ''}
                onClick={() => setSelectedKey(block.key)}
              >
                <span aria-hidden="true">└─</span>
                <b>[EQUIPPED]</b>
                <strong>{block.occupant?.name}</strong>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className="zip-rack-center">
        <header className="zip-rack-titlebar">
          <div>
            <span>CONTAINER / RACK ELEVATION</span>
            <h1>{view.rack.name}</h1>
          </div>
          <b>{totalU}U Total Capacity</b>
        </header>

        <div className="zip-rack-stage">
          <div className="zip-rack-cabinet">
            <div className="zip-rack-cap">{view.rack.name}</div>

            <div className="zip-rack-units" style={{ '--rack-total-u': totalU } as CSSProperties}>
              <div className="zip-rack-u-scale" aria-hidden="true">
                {Array.from({ length: totalU }, (_, index) => totalU - index).map((u) => (
                  <span key={u}>{u}</span>
                ))}
              </div>

              <div className="zip-rack-ru-grid" aria-hidden="true" />

              {blocks
                .filter((block) => block.role !== 'AVAILABLE')
                .map((block) => {
                  const gridRow = totalU - block.topU + 1;
                  const selected = selectedKey === block.key;
                  const occupantHref = block.occupant
                    ? context.inventoryHrefs[block.occupant.id]
                    : undefined;

                  return (
                    <button
                      key={block.key}
                      type="button"
                      className={[
                        'zip-rack-allocation',
                        `is-${block.role.toLowerCase()}`,
                        selected ? 'is-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        gridRow: `${gridRow} / span ${block.units}`,
                      }}
                      onClick={() => setSelectedKey(block.key)}
                      onDoubleClick={() => {
                        if (occupantHref) window.location.assign(occupantHref);
                      }}
                    >
                      {block.role === 'CLEARANCE' ? (
                        <span className="zip-rack-clearance">CLEARANCE ({block.units}U)</span>
                      ) : block.occupant ? (
                        <>
                          <strong>{block.occupant.name}</strong>
                          <span>
                            <b>EQUIPPED</b>
                            <i aria-hidden="true" />
                          </span>
                        </>
                      ) : (
                        <strong>{block.role}</strong>
                      )}
                    </button>
                  );
                })}
            </div>

            <div className="zip-rack-feet" aria-hidden="true">
              <span />
              <span />
            </div>
          </div>
        </div>
      </main>

      <aside className="zip-rack-properties">
        <header>
          <h2>CAS PROPERTIES</h2>
        </header>

        {!selectedBlock ? (
          <div className="zip-rack-empty-properties">
            <span aria-hidden="true">▤</span>
            <strong>SELECT A SLOT</strong>
            <p>TO INSPECT</p>
          </div>
        ) : (
          <div className="zip-rack-property-stack">
            <section className="zip-rack-selected-card">
              <span>{selectedBlock.role === 'PHYSICAL' ? 'EQUIPPED' : selectedBlock.role}</span>
              <strong>{selectedBlock.occupant?.name ?? selectedBlock.role}</strong>
            </section>

            <section className="zip-rack-detail-card">
              <h3>MOUNTING</h3>
              <dl>
                <div>
                  <dt>U-Range</dt>
                  <dd>
                    U{selectedRange?.startU ?? selectedBlock.bottomU} → U
                    {selectedRange?.endU ?? selectedBlock.topU}
                  </dd>
                </div>
                <div>
                  <dt>Physical</dt>
                  <dd>{selectedRange?.physicalSizeU ?? selectedBlock.units}U</dd>
                </div>
                <div>
                  <dt>Total Reserved</dt>
                  <dd>
                    {selectedRange
                      ? selectedRange.endU - selectedRange.startU + 1
                      : selectedBlock.units}
                    U
                  </dd>
                </div>
                <div>
                  <dt>Clearance</dt>
                  <dd>
                    ↑{selectedRange?.clearanceTopU ?? 0}U / ↓{selectedRange?.clearanceBottomU ?? 0}U
                  </dd>
                </div>
              </dl>
            </section>

            {selectedBlock.occupant && (
              <section className="zip-rack-detail-card">
                <h3>DEVICE</h3>
                <dl>
                  <div>
                    <dt>Category</dt>
                    <dd>
                      {selectedBlock.occupant.category ?? kindLabel(selectedBlock.occupant.kind)}
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd className="is-good">ACTIVE</dd>
                  </div>
                </dl>

                {context.inventoryHrefs[selectedBlock.occupant.id] && (
                  <Link
                    className="zip-rack-open-device"
                    href={context.inventoryHrefs[selectedBlock.occupant.id]!}
                  >
                    OPEN DEVICE →
                  </Link>
                )}
              </section>
            )}
          </div>
        )}
      </aside>
    </section>
  );
}
