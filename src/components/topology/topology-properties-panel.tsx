import type { TopologyNode } from '@/modules/topology/domain/entities';

function value(value: string | number | undefined, fallback = '—'): string {
  return value === undefined ? fallback : String(value);
}

function coordinates(raw: string | undefined): string {
  if (!raw) return '—';
  return raw.replace(',', ', ');
}

export function TopologyPropertiesPanel({
  node,
  contained,
  previewContained,
}: Readonly<{
  node: TopologyNode;
  contained: number;
  previewContained?: number;
}>) {
  if (node.kind === 'SITE') {
    const load = node.details?.currentLoad;
    const capacity = node.details?.totalPowerCapacity;
    const percent =
      load !== undefined && capacity && capacity > 0
        ? Math.max(0, Math.min(100, (load / capacity) * 100))
        : 0;
    const alarms = node.details?.activeAlarms;

    return (
      <aside className="telxius-properties">
        <header>SITE PROPERTIES</header>

        <section>
          <h3>⚡ POWER LOAD</h3>
          <div className="telxius-property-card telxius-power-card">
            <strong>
              {value(load)} <small>kW</small>
            </strong>
            <span>/ {value(capacity)} kW</span>
            <div className="telxius-meter">
              <i style={{ width: `${percent}%` }} />
            </div>
          </div>
        </section>

        <section>
          <h3 className="is-warning">⌁ ACTIVE ALARMS</h3>
          <div className="telxius-property-card telxius-health-card">
            <span>SYSTEM STATUS</span>
            <b>{alarms === 0 ? 'HEALTHY' : `${value(alarms)} ACTIVE`}</b>
          </div>
        </section>

        <section>
          <h3>METADATA</h3>
          <dl className="telxius-property-list">
            <div>
              <dt>TOTAL AREA</dt>
              <dd>{node.totalAreaSqm !== undefined ? `${node.totalAreaSqm} m²` : '—'}</dd>
            </div>
            <div>
              <dt>CATEGORY</dt>
              <dd>{value(node.category)}</dd>
            </div>
            <div>
              <dt>DISTRICT</dt>
              <dd>{value(node.district)}</dd>
            </div>
            <div>
              <dt>COORDINATES</dt>
              <dd className="is-accent">{coordinates(node.geoCoords)}</dd>
            </div>
          </dl>
        </section>
      </aside>
    );
  }

  if (node.kind === 'STRUCTURE') {
    return (
      <aside className="telxius-properties">
        <header>STRUCTURE STATS</header>
        <section className="telxius-stat-stack">
          <div className="telxius-property-card">
            <span>TOTAL LEVELS</span>
            <strong>{contained}</strong>
          </div>
          <div className="telxius-property-card">
            <span>TOTAL ROOMS</span>
            <strong>{previewContained ?? 0}</strong>
          </div>
        </section>
        <div className="telxius-inspect-hint">
          <span>⌗</span>
          <p>
            CLICK A ROOM
            <br />
            TO INSPECT PROPERTIES
          </p>
          <p>
            DOUBLE CLICK
            <br />
            TO OPEN
          </p>
        </div>
      </aside>
    );
  }

  if (node.kind === 'ROOM_SUBSTRUCTURE') {
    return (
      <aside className="telxius-properties">
        <header>ROOM PROPERTIES</header>
        <section className="telxius-stat-stack">
          <div className="telxius-property-card">
            <span>TOTAL CLUSTERS</span>
            <strong>{contained}</strong>
          </div>
        </section>
        <div className="telxius-inspect-hint">
          <span>⌗</span>
          <p>
            CLICK A CLUSTER OR CABINET
            <br />
            TO INSPECT PROPERTIES
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="telxius-properties">
      <header>CURRENT SELECTION</header>
      <section className="telxius-stat-stack">
        <div className="telxius-property-card">
          <span>CANONICAL TYPE</span>
          <strong>{node.kind.replaceAll('_', ' ')}</strong>
        </div>
        <div className="telxius-property-card">
          <span>CONTAINED</span>
          <strong>{contained}</strong>
        </div>
      </section>
    </aside>
  );
}
