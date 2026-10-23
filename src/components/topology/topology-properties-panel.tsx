import { useTranslations } from 'next-intl';
import type { BdfbPresentation } from '@/modules/power/domain/bdfb-model';
import { isValidPolygon, polygonArea } from '@/modules/spatial/domain/geometry';
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
  location,
  feeds,
  bdfb,
  mappedBreakers = 0,
}: Readonly<{
  node: TopologyNode;
  contained: number;
  previewContained?: number;
  location?: string;
  feeds?: readonly string[];
  bdfb?: BdfbPresentation | null;
  mappedBreakers?: number;
}>) {
  const t = useTranslations('topologyViews');
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
        <header>{t('siteProperties')}</header>

        <section>
          <h3>{t('powerLoad')}</h3>
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
          <h3 className="is-warning">{t('activeAlarms')}</h3>
          <div className="telxius-property-card telxius-health-card">
            <span>{t('systemStatus')}</span>
            <b>{alarms === 0 ? t('configured') : t('activeCount', { count: alarms ?? 0 })}</b>
          </div>
        </section>

        <section>
          <h3>{t('metadata')}</h3>
          <dl className="telxius-property-list">
            <div>
              <dt>{t('totalArea')}</dt>
              <dd>
                {isValidPolygon(node.polygon)
                  ? `${(polygonArea(node.polygon) / 1_000_000).toFixed(2)} m²`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>{t('boundary')}</dt>
              <dd>
                {node.polygon?.length
                  ? t('vertices', { count: node.polygon.length })
                  : t('notDrawn')}
              </dd>
            </div>
            <div>
              <dt>{t('category')}</dt>
              <dd>{value(node.category)}</dd>
            </div>
            <div>
              <dt>{t('district')}</dt>
              <dd>{value(node.district)}</dd>
            </div>
            <div>
              <dt>{t('coordinates')}</dt>
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
        <header>{t('structureStats')}</header>
        <section className="telxius-stat-stack">
          <div className="telxius-property-card">
            <span>{t('totalLevels')}</span>
            <strong>{contained}</strong>
          </div>
          <div className="telxius-property-card">
            <span>{t('totalRooms')}</span>
            <strong>{previewContained ?? 0}</strong>
          </div>
        </section>
        <div className="telxius-inspect-hint">
          <span>⌗</span>
          <p>
            {t('clickRoom')}
            <br />
            {t('inspectProperties')}
          </p>
          <p>
            {t('doubleClick')}
            <br />
            {t('toOpen')}
          </p>
        </div>
      </aside>
    );
  }

  if (node.kind === 'DEVICE' && bdfb) {
    const frames = bdfb.shelves.flatMap((shelf) => shelf.frames);
    const panels = frames.flatMap((frame) => frame.panels);
    const physicalShelves = bdfb.shelves.filter((shelf) => shelf.physical !== false).length;
    const physicalFrames = frames.filter((frame) => frame.physical).length;
    const panelGroups = frames.filter((frame) => !frame.physical).length;
    const positions = panels.flatMap((panel) => panel.positions);
    const breakers = positions.filter(Boolean);
    const hasA = feeds?.includes('A') ?? false;
    const hasB = feeds?.includes('B') ?? false;

    return (
      <aside className="telxius-properties zip-bdfb-inspector">
        <header>
          {t('inspectorTitle')} <span>⌄</span>
        </header>
        <div className="zip-bdfb-inspector-id">
          <span>▥</span>
          <div>
            <h2>{node.name}</h2>
            <small>{location ?? t('infrastructure')}</small>
          </div>
        </div>
        <dl>
          <dt>{t('type')}</dt>
          <dd>BDFB</dd>
          <dt>{t('location')}</dt>
          <dd>{location ?? '—'}</dd>
          <dt>{t('shelves')}</dt>
          <dd>{physicalShelves}</dd>
          <dt>{t('frames')}</dt>
          <dd>{physicalFrames}</dd>
          <dt>{t('panelGroups')}</dt>
          <dd>{panelGroups}</dd>
          <dt>{t('panels')}</dt>
          <dd>{panels.length}</dd>
          <dt>{t('breakers')}</dt>
          <dd>{breakers.length}</dd>
          <dt>{t('feedA')}</dt>
          <dd>{hasA ? t('configured') : '—'}</dd>
          <dt>{t('feedB')}</dt>
          <dd>{hasB ? t('configured') : '—'}</dd>
          <dt>{t('telemetryLabel')}</dt>
          <dd>{mappedBreakers > 0 ? t('explicit') : t('unmapped')}</dd>
        </dl>
        <section className="zip-bdfb-status-card">
          <h3>{t('status')}</h3>
          <div>
            <span>●</span>
            <strong>{t('physicalRecorded')}</strong>
            <small>{t('liveRequirement')}</small>
          </div>
        </section>
        <div className="zip-bdfb-actions">
          <span>{t('mappedBreakers', { count: mappedBreakers })}</span>
          <span>{t('selectPanel')}</span>
        </div>
      </aside>
    );
  }

  if (node.kind === 'DEVICE' && node.deviceType === 'BDFB') {
    return (
      <aside className="telxius-properties zip-bdfb-inspector zip-bdfb-inspector--unavailable">
        <header>
          {t('bdfbStatus')} <span>⌄</span>
        </header>
        <div className="zip-bdfb-inspector-id">
          <span>▥</span>
          <div>
            <h2>{node.name}</h2>
            <small>{location ?? t('infrastructure')}</small>
          </div>
        </div>
        <dl>
          <dt>{t('type')}</dt>
          <dd>BDFB</dd>
          <dt>{t('location')}</dt>
          <dd>{location ?? '—'}</dd>
          <dt>{t('physicalModel')}</dt>
          <dd>{t('unavailable')}</dd>
          <dt>{t('telemetryLabel')}</dt>
          <dd>{t('waiting')}</dd>
        </dl>
        <section className="zip-bdfb-status-card">
          <h3>{t('recovery')}</h3>
          <div>
            <span>○</span>
            <strong>{t('hierarchyIncomplete')}</strong>
            <small>{t('devicePreserved')}</small>
          </div>
        </section>
      </aside>
    );
  }

  if (node.kind === 'ROOM_SUBSTRUCTURE') {
    return (
      <aside className="telxius-properties">
        <header>{t('roomProperties')}</header>
        <section className="telxius-stat-stack">
          <div className="telxius-property-card">
            <span>{t('totalClusters')}</span>
            <strong>{contained}</strong>
          </div>
        </section>
        <div className="telxius-inspect-hint">
          <span>⌗</span>
          <p>
            {t('clickCluster')}
            <br />
            {t('inspectProperties')}
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="telxius-properties">
      <header>{t('currentSelection')}</header>
      <section className="telxius-stat-stack">
        <div className="telxius-property-card">
          <span>{t('canonicalType')}</span>
          <strong>{node.kind.replaceAll('_', ' ')}</strong>
        </div>
        <div className="telxius-property-card">
          <span>{t('containedUpper')}</span>
          <strong>{contained}</strong>
        </div>
      </section>
    </aside>
  );
}
