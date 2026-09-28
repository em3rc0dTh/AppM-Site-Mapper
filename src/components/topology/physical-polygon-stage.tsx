import type { PhysicalPoint, TopologyNode } from '@/modules/topology/domain/entities';

export interface PhysicalPolygonItem {
  readonly node: TopologyNode;
  readonly href: string;
}

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

function pointsFor(node: TopologyNode): readonly PhysicalPoint[] {
  return 'polygon' in node && Array.isArray(node.polygon) ? node.polygon : [];
}

function boundsOf(polygons: readonly (readonly PhysicalPoint[])[]): Bounds | null {
  const points = polygons.flat();
  if (points.length === 0) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  return { minX, minY, maxX, maxY, width, height };
}

function centroid(points: readonly PhysicalPoint[]): PhysicalPoint {
  if (points.length === 0) return { x: 0, y: 0 };

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function pointsAttribute(points: readonly PhysicalPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

export function PhysicalPolygonStage({
  boundary,
  items,
  mode,
}: Readonly<{
  boundary?: readonly PhysicalPoint[];
  items: readonly PhysicalPolygonItem[];
  mode: 'site' | 'structure';
}>) {
  const itemPolygons = items.map(({ node }) => pointsFor(node)).filter((polygon) => polygon.length >= 3);
  const polygons = [...(boundary && boundary.length >= 3 ? [boundary] : []), ...itemPolygons];
  const bounds = boundsOf(polygons);

  if (!bounds || itemPolygons.length === 0) {
    return (
      <div className="telxius-geometry-missing">
        <strong>Physical geometry unavailable</strong>
        <span>
          This view only renders surveyed legacy geometry that was preserved in the canonical model.
        </span>
      </div>
    );
  }

  const pad = Math.max(bounds.width, bounds.height) * 0.12;
  const viewBox = [
    bounds.minX - pad,
    bounds.minY - pad,
    bounds.width + pad * 2,
    bounds.height + pad * 2,
  ].join(' ');
  const labelSize = Math.max(bounds.width, bounds.height) * 0.012;

  return (
    <div className={`telxius-physical-map telxius-physical-map--${mode}`}>
      <svg viewBox={viewBox} role="img" aria-label={mode === 'site' ? 'Site physical layout' : 'Structure floor layout'}>
        <defs>
          <pattern
            id={`telxius-grid-${mode}`}
            width={Math.max(bounds.width / 16, 300)}
            height={Math.max(bounds.height / 16, 300)}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${Math.max(bounds.width / 16, 300)} 0 L 0 0 0 ${Math.max(bounds.height / 16, 300)}`}
              className="telxius-map-grid-line"
            />
          </pattern>
        </defs>

        <rect
          x={bounds.minX - pad}
          y={bounds.minY - pad}
          width={bounds.width + pad * 2}
          height={bounds.height + pad * 2}
          fill={`url(#telxius-grid-${mode})`}
        />

        {boundary && boundary.length >= 3 && (
          <polygon
            points={pointsAttribute(boundary)}
            className="telxius-map-boundary"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {items.map(({ node, href }) => {
          const polygon = pointsFor(node);
          if (polygon.length < 3) return null;

          const center = centroid(polygon);

          return (
            <a href={href} key={node.id} className="telxius-map-link">
              <polygon
                points={pointsAttribute(polygon)}
                className="telxius-map-footprint"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={center.x}
                y={center.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="telxius-map-label"
                style={{ fontSize: labelSize }}
              >
                {node.name.toUpperCase()}
              </text>
            </a>
          );
        })}
      </svg>

      <div className="telxius-map-controls" aria-hidden="true">
        <span>⊕</span>
        <span>⌗</span>
        <span>⊖</span>
      </div>
    </div>
  );
}
