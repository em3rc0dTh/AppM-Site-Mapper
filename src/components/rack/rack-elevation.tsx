'use client';

import { useState } from 'react';
import type { RackElevationView } from '@/modules/rack/application/rack-elevation-service';
import { EntityInspector, InspectButton, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { topologyInspector } from '@/shared/ui/entity-adapters';
import {
  DataView,
  EntityRow,
  MetricTile,
  SectionHeader,
  StatePanel,
  StatusBadge,
  Surface,
} from '@/shared/ui/primitives';

export function RackElevation({ view }: { view: RackElevationView }) {
  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  const count = (role: string) => view.rows.filter((row) => row.role === role).length;
  const physical = count('PHYSICAL');
  const reserved = count('RESERVED');
  const clearance = count('CLEARANCE');
  const available = count('AVAILABLE');
  return (
    <section>
      <SectionHeader
        eyebrow="Physical / Rack elevation"
        title={view.rack.name}
        description="Front elevation · highest U at top · select an occupant to inspect"
        actions={
          <>
            <StatusBadge>{view.rack.totalU}U</StatusBadge>
            <InspectButton entity={topologyInspector(view.rack)} />
          </>
        }
      />
      <div className="metric-grid">
        <MetricTile label="Physical occupancy" value={physical} unit="U" />
        <MetricTile label="Reserved" value={reserved} unit="U" />
        <MetricTile label="Clearance" value={clearance} unit="U" />
        <MetricTile label="Available" value={available} unit="U" />
      </div>
      <div className="rack-layout">
        <div>
          <div className="rack-elevation-shell" aria-label={`Rack elevation for ${view.rack.name}`}>
            {view.rows.map((row) => {
              const item = row.occupant
                ? view.inventory.find((item) => item.id === row.occupant?.id)
                : undefined;
              const content = (
                <>
                  <strong>
                    {row.role === 'CLEARANCE' ? 'Clearance' : (row.occupant?.name ?? row.role)}
                  </strong>
                  <small>{row.occupant?.kind ?? row.state}</small>
                </>
              );
              return (
                <div key={row.u} className={`rack-unit rack-unit--${row.role.toLowerCase()}`}>
                  <span className="rack-unit-number">{row.u}U</span>
                  {item ? (
                    <button
                      type="button"
                      className="rack-unit-state"
                      aria-label={`Inspect ${item.name} at U${row.u}`}
                      onClick={() => setSelected(topologyInspector(item))}
                    >
                      {content}
                    </button>
                  ) : (
                    <span className="rack-unit-state">{content}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rack-legend">
            <StatusBadge tone="accent">EQUIPPED</StatusBadge>
            <StatusBadge tone="warning">RESERVED</StatusBadge>
            <StatusBadge>CLEARANCE</StatusBadge>
            <StatusBadge>AVAILABLE</StatusBadge>
          </div>
        </div>
        <Surface>
          <h2>Rack inventory</h2>
          <p>{view.inventory.length} Device / Equipment identities</p>
          {view.inventory.length ? (
            <DataView label="Rack inventory">
              {view.inventory.map((item) => (
                <EntityRow
                  key={item.id}
                  name={item.name}
                  kind={item.kind}
                  metadata={item.category ?? ''}
                  actions={<InspectButton entity={topologyInspector(item)} />}
                />
              ))}
            </DataView>
          ) : (
            <StatePanel
              title="No inventory placed"
              description="Device and Equipment will appear here when placed in this rack."
            />
          )}
        </Surface>
      </div>
      {selected && <EntityInspector entity={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
