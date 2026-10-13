'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type CSSProperties } from 'react';

import { TopologyCreateControl } from '@/components/topology/topology-create-form';
import { RackTemplateInstantiator } from '@/components/warehouse/rack-template-instantiator';
import type { RackElevationView } from '@/modules/rack/application/rack-elevation-service';
import { topologyInspector } from '@/shared/ui/entity-adapters';
import { InlineInspector } from '@/shared/ui/inline-inspector';
import type { InspectorEntity } from '@/shared/ui/entity-inspector';

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
      blocks[blocks.length - 1] = { ...previous, bottomU: row.u, units: previous.units + 1 };
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
  return role === 'PHYSICAL' ? 'EQUIPPED' : role;
}

export interface RackElevationContext {
  readonly positionName?: string;
  readonly coordinate?: string;
}

export function RackElevation({
  view,
  context,
  focusDeviceId,
  canWrite = false,
}: Readonly<{
  view: RackElevationView;
  context?: RackElevationContext;
  focusDeviceId?: string;
  canWrite?: boolean;
}>) {
  const router = useRouter();

  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  const blocks = useMemo(() => buildBlocks(view), [view]);
  const count = (role: string) => view.rows.filter((row) => row.role === role).length;
  const physical = count('PHYSICAL');
  const reserved = count('RESERVED');
  const available = count('AVAILABLE');
  const totalU = view.rack.totalU ?? view.rows.length;

  return (
    <section className="legacy-rack-view zip-rack-elevation-view">
      <div className="legacy-rack-main zip-rack-elevation-main">
        <header className="zip-elevation-heading">
          <h1>FRONT ELEVATION</h1>
          <small>
            Only the documented front-face projection is available. Rear geometry has not been
            recorded.
          </small>
        </header>

        <div className="legacy-rack-canvas zip-elevation-canvas">
          <div className="legacy-rack-frame zip-elevation-rack">
            <div className="legacy-rack-metal legacy-rack-metal--top">
              <span />
            </div>
            <div className="legacy-rack-units">
              {blocks.map((block) => {
                const item = block.occupant
                  ? view.inventory.find((candidate) => candidate.id === block.occupant?.id)
                  : undefined;
                const style = {
                  '--rack-block-units': block.units,
                  minHeight: `max(${block.units * 3}px, ${block.units === 1 ? 18 : 26}px)`,
                } as CSSProperties;
                const body = (
                  <>
                    <span className="legacy-rack-scale">
                      <b>{String(block.topU).padStart(2, '0')}U</b>
                      {block.units > 1 && <b>{String(block.bottomU).padStart(2, '0')}U</b>}
                    </span>
                    <span className="legacy-rack-block-copy">
                      <strong>{block.occupant?.name ?? roleLabel(block.role)}</strong>
                    </span>
                  </>
                );
                return item ? (
                  <button
                    key={block.key}
                    type="button"
                    className={`legacy-rack-block legacy-rack-block--${block.role.toLowerCase()} ${item.id === focusDeviceId ? 'is-selected' : ''}`}
                    style={style}
                    onClick={() =>
                      setSelected({
                        ...topologyInspector(item),
                        actions: [
                          {
                            label: item.kind === 'DEVICE' ? 'OPEN DEVICE' : 'OPEN EQUIPMENT',
                            href: `/device/${item.id}`,
                          },
                          { label: 'TRACE POWER', href: `/power?entity=${item.id}` },
                        ],
                      })
                    }
                    onDoubleClick={() => router.push(`/device/${item.id}`)}
                  >
                    {body}
                  </button>
                ) : (
                  <div
                    key={block.key}
                    className={`legacy-rack-block legacy-rack-block--${block.role.toLowerCase()}`}
                    style={style}
                  >
                    {body}
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

      <aside className="legacy-rack-properties zip-elevation-inspector">
        <header>
          INSPECTOR <span>⌄</span>
        </header>
        <div className="zip-elevation-identity">
          <span>▥</span>
          <div>
            <h2>{view.rack.name}</h2>
            <small>
              {context?.positionName ?? 'Rack position'}{' '}
              {context?.coordinate ? `/ ${context.coordinate}` : ''}
            </small>
          </div>
        </div>
        <dl className="zip-elevation-stats">
          <dt>Capacity</dt>
          <dd>{totalU}U</dd>
          <dt>Used</dt>
          <dd>{physical}U</dd>
          <dt>Free</dt>
          <dd>{available}U</dd>
          <dt>Reserved</dt>
          <dd>{reserved}U</dd>
        </dl>
        <section className="zip-rack-inventory">
          <header>
            <h3>RACK INVENTORY</h3>
            <span>{view.inventory.length} objects</span>
          </header>
          {canWrite && (
            <div className="zip-rack-inventory-actions">
              <RackTemplateInstantiator rackId={view.rack.id} />
              <details className="rack-one-off-create">
                <summary>+ CREATE ONE-OFF</summary>
                <div>
                  <TopologyCreateControl kind="DEVICE" parentId={view.rack.id} />
                </div>
              </details>
            </div>
          )}
          <div className="zip-rack-inventory-list">
            {view.inventory.length ? (
              view.inventory.map((item) => {
                const mounted = view.rack.cas.some(
                  (range) => range.state === 'EQUIPPED' && range.occupantId === item.id,
                );
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setSelected({
                        ...topologyInspector(item),
                        actions: [
                          { label: 'OPEN EQUIPMENT', href: `/device/${item.id}` },
                          { label: 'TRACE POWER', href: `/power?entity=${item.id}` },
                        ],
                      })
                    }
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.kind}
                        {item.template
                          ? ` · ${item.template.templateName} v${item.template.templateVersion}`
                          : ''}
                      </small>
                    </span>
                    <b data-state={mounted ? 'mounted' : 'unmounted'}>
                      {mounted ? 'MOUNTED' : 'UNMOUNTED'}
                    </b>
                  </button>
                );
              })
            ) : (
              <p>No Equipment instances have been created for this rack yet.</p>
            )}
          </div>
        </section>

        <section className="zip-equipment-summary">
          <h3>EQUIPMENT SUMMARY</h3>
          <div>
            <span className="is-available" />
            <b>Available</b>
            <strong>{available}U</strong>
          </div>
          <div>
            <span className="is-reserved" />
            <b>Reserved</b>
            <strong>{reserved}U</strong>
          </div>
          <div>
            <span className="is-equipped" />
            <b>Equipped</b>
            <strong>{physical}U</strong>
          </div>
        </section>
      </aside>

      {selected && <InlineInspector entity={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
