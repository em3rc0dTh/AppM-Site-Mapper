import type { RackElevationView } from '@/modules/rack/application/rack-elevation-service';

export function RackElevation({ view }: Readonly<{ view: RackElevationView }>) {
  return (
    <section className="rack-elevation-panel">
      <header className="rack-elevation-header">
        <div>
          <p className="eyebrow">Rack Elevation</p>
          <h1>{view.rack.name}</h1>
        </div>
        <div className="rack-elevation-meta">
          <span>{view.rack.totalU}U</span>
          <span>{view.inventory.length} inventory items</span>
        </div>
      </header>

      <div className="rack-elevation-shell" aria-label={`Rack elevation for ${view.rack.name}`}>
        {view.rows.map((row) => (
          <div
            key={row.u}
            className={`rack-unit rack-unit--${row.role.toLowerCase()}`}
            title={
              row.occupant
                ? `${row.occupant.kind}: ${row.occupant.name}`
                : `${row.state} · allocation ${row.allocationId}`
            }
          >
            <span className="rack-unit-number">U{row.u}</span>
            <span className="rack-unit-state">
              {row.occupant ? (
                <>
                  <strong>{row.occupant.name}</strong>
                  <small>{row.occupant.kind === 'DEVICE' ? 'Device' : 'Equipment'}</small>
                </>
              ) : (
                <>
                  <strong>{row.role}</strong>
                  <small>{row.state}</small>
                </>
              )}
            </span>
          </div>
        ))}
      </div>

      <aside className="rack-inventory-list">
        <h2>Inventory</h2>
        {view.inventory.length === 0 ? (
          <p>No Device or Equipment has been placed in this rack.</p>
        ) : (
          <ul>
            {view.inventory.map((item) => (
              <li key={item.id}>
                <span>{item.kind === 'DEVICE' ? 'Device' : 'Equipment'}</span>
                <strong>{item.name}</strong>
                {item.category ? <small>{item.category}</small> : null}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </section>
  );
}
