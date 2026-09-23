import type { RackElevationProjection } from '@/modules/rack/domain/elevation';

export function RackElevation({
  elevation,
}: Readonly<{ elevation: RackElevationProjection }>) {
  return (
    <section className="rack-elevation" aria-label={`${elevation.rackName} rack elevation`}>
      <header className="rack-elevation-header">
        <div>
          <p className="eyebrow">Rack Elevation</p>
          <h2>{elevation.rackName}</h2>
        </div>
        <strong>{elevation.totalU}U</strong>
      </header>

      <ol className="rack-units">
        {elevation.units.map((unit) => (
          <li
            key={unit.u}
            className={`rack-unit rack-unit-${unit.role.toLowerCase()}`}
            data-state={unit.state}
          >
            <span className="rack-u-label">U{unit.u}</span>
            <span className="rack-u-state">{unit.state}</span>
            <span className="rack-u-content">
              {unit.occupant
                ? `${unit.occupant.kind === 'DEVICE' ? 'Device' : 'Equipment'} · ${unit.occupant.name}`
                : unit.role === 'CLEARANCE'
                  ? 'Reserved clearance'
                  : unit.role === 'PHYSICAL'
                    ? 'Reserved physical space'
                    : 'Available'}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
