'use client';

import { useState, type CSSProperties } from 'react';

import type { RackElevationView } from '@/modules/rack/application/rack-elevation-service';
import { topologyInspector } from '@/shared/ui/entity-adapters';
import { EntityInspector, InspectButton, type InspectorEntity } from '@/shared/ui/entity-inspector';
import {
  DataView,
  EntityRow,
  SectionHeader,
  StatePanel,
  StatusBadge,
  Surface,
} from '@/shared/ui/primitives';

export function RackElevation({ view }: Readonly<{ view: RackElevationView }>) {
  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  const count = (role: string) => view.rows.filter((row) => row.role === role).length;
  const stats = [
    { label: 'Physical', value: count('PHYSICAL'), tone: 'equipped' },
    { label: 'Reserved', value: count('RESERVED'), tone: 'reserved' },
    { label: 'Clearance', value: count('CLEARANCE'), tone: 'clearance' },
    { label: 'Available', value: count('AVAILABLE'), tone: 'available' },
  ];

  return (
    <section className="rack-elevation-view">
      <SectionHeader
        eyebrow="Physical / Rack elevation"
        title={view.rack.name}
        description="Front elevation · complete rack fits the operational viewport · highest U at top"
        actions={
          <>
            <StatusBadge>{view.rack.totalU}U</StatusBadge>
            <InspectButton entity={topologyInspector(view.rack)} />
          </>
        }
      />

      <div className="rack-metric-strip" aria-label="Rack capacity summary">
        {stats.map((stat) => (
          <div key={stat.label} className={`rack-metric rack-metric--${stat.tone}`}>
            <span>{stat.label}</span>
            <strong>
              {stat.value}
              <small>U</small>
            </strong>
          </div>
        ))}
      </div>

      <div className="rack-layout rack-layout--visual">
        <div className="rack-physical-stage">
          <div className="rack-rail rack-rail--left" aria-hidden="true" />
          <div
            className="rack-elevation-shell"
            aria-label={`Rack elevation for ${view.rack.name}`}
            style={
              {
                '--rack-units': view.rack.totalU,
                gridTemplateRows: `repeat(${view.rack.totalU}, minmax(0, 1fr))`,
              } as CSSProperties
            }
          >
            {view.rows.map((row, index) => {
              const item = row.occupant
                ? view.inventory.find((candidate) => candidate.id === row.occupant?.id)
                : undefined;
              const previous = index > 0 ? view.rows[index - 1] : undefined;
              const continuesOccupant =
                !!row.occupant &&
                previous?.occupant?.id === row.occupant.id &&
                previous.role === row.role;
              const label =
                row.role === 'CLEARANCE'
                  ? 'Clearance'
                  : continuesOccupant
                    ? ''
                    : (row.occupant?.name ?? row.role);

              return (
                <div key={row.u} className={`rack-unit rack-unit--${row.role.toLowerCase()}`}>
                  <span className="rack-unit-number">{row.u}</span>
                  {item ? (
                    <button
                      type="button"
                      className="rack-unit-state"
                      aria-label={`Inspect ${item.name} at U${row.u}`}
                      onClick={() => setSelected(topologyInspector(item))}
                    >
                      <strong>{label}</strong>
                      {!continuesOccupant && <small>{row.occupant?.kind}</small>}
                    </button>
                  ) : (
                    <span className="rack-unit-state">
                      <strong>{label}</strong>
                      {row.role !== 'CLEARANCE' && <small>{row.state}</small>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rack-rail rack-rail--right" aria-hidden="true" />
        </div>

        <Surface className="rack-inventory-panel">
          <div className="rack-inventory-heading">
            <div>
              <span className="eyebrow">Mounted identities</span>
              <h2>Rack inventory</h2>
            </div>
            <StatusBadge tone="accent">{view.inventory.length}</StatusBadge>
          </div>
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
              description="Device and Equipment identities appear here when mounted in CAS."
            />
          )}
          <div className="rack-legend">
            <StatusBadge tone="accent">EQUIPPED</StatusBadge>
            <StatusBadge tone="warning">RESERVED</StatusBadge>
            <StatusBadge>CLEARANCE</StatusBadge>
            <StatusBadge>AVAILABLE</StatusBadge>
          </div>
        </Surface>
      </div>

      {selected && <EntityInspector entity={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
