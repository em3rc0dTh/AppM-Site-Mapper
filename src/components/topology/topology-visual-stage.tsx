import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

import type { TopologyNode } from '@/modules/topology/domain/entities';
import { PhysicalPolygonStage } from '@/components/topology/physical-polygon-stage';
import { Icon, StatusBadge } from '@/shared/ui/primitives';

export interface VisualStageChild {
  readonly node: TopologyNode;
  readonly href: string;
}

function metadata(node: TopologyNode): string {
  switch (node.kind) {
    case 'POSITION':
      return `${node.coordinate.row}-${node.coordinate.column}`;
    case 'CONTAINER_RACK':
      return node.variant === 'RACK' && node.totalU ? `${node.totalU}RU` : node.variant;
    case 'DEVICE':
    case 'EQUIPMENT':
      return node.category ?? node.kind;
    case 'ROOM_SUBSTRUCTURE':
      return node.variant;
    case 'CONTAINER_CLUSTER_BAY':
      return node.variant;
    default:
      return node.kind.replaceAll('_', ' ');
  }
}

function titleFor(node: TopologyNode): string {
  switch (node.kind) {
    case 'NETWORK':
      return 'Network infrastructure';
    case 'SITE':
      return 'Site structures';
    case 'STRUCTURE':
      return 'Structure levels';
    case 'LEVEL':
      return 'Level floor plan';
    case 'CONTAINER_CLUSTER_BAY':
      return 'Bay positions';
    case 'POSITION':
      return 'Position occupancy';
    case 'DEVICE':
      return 'Device internals';
    case 'EQUIPMENT':
      return 'Equipment context';
    default:
      return 'Infrastructure view';
  }
}

function ChildLink({
  child,
  href,
  className = '',
  children,
  style,
}: Readonly<{
  child: TopologyNode;
  href: string;
  className?: string;
  children?: ReactNode;
  style?: CSSProperties;
}>) {
  return (
    <Link className={`legacy-stage-node ${className}`} href={href} style={style}>
      {children ?? (
        <>
          <span className="legacy-stage-node-icon">
            <Icon
              name={
                child.kind === 'ROOM_SUBSTRUCTURE'
                  ? 'room'
                  : child.kind === 'NETWORK'
                    ? 'network'
                    : 'box'
              }
            />
          </span>
          <span>
            <small>{metadata(child)}</small>
            <strong>{child.name}</strong>
          </span>
          <span className="legacy-stage-enter">↗</span>
        </>
      )}
    </Link>
  );
}

function NetworkSiteCanvas({ items }: { items: readonly VisualStageChild[] }) {
  return (
    <div className="legacy-site-canvas">
      <div className="legacy-site-map-grid" aria-hidden="true" />
      <div className="legacy-site-hud">
        <span className="legacy-site-hud-target">◎</span>
        <span>SCHEMATIC SITE VIEW</span>
        <b>● ONLINE</b>
      </div>
      <div className="legacy-site-boundary">
        <span className="legacy-corner legacy-corner--tl" />
        <span className="legacy-corner legacy-corner--tr" />
        <span className="legacy-corner legacy-corner--bl" />
        <span className="legacy-corner legacy-corner--br" />
        {items.map(({ node, href }) => (
          <ChildLink key={node.id} child={node} href={href} className="legacy-site-footprint">
            <span className="legacy-site-footprint-crosshair" aria-hidden="true">
              +
            </span>
            <span>
              <small>{metadata(node)}</small>
              <strong>{node.name}</strong>
            </span>
            <span className="legacy-stage-enter">↗</span>
          </ChildLink>
        ))}
      </div>
      <div className="legacy-site-controls" aria-hidden="true">
        <span>+</span>
        <span>−</span>
        <span>◎</span>
      </div>
    </div>
  );
}

function StructureCanvas({
  node,
  items,
  previewItems,
  activeItemId,
}: {
  node: TopologyNode;
  items: readonly VisualStageChild[];
  previewItems: readonly VisualStageChild[];
  activeItemId?: string | undefined;
}) {
  return (
    <div className="telxius-structure-stage">
      <PhysicalPolygonStage
        boundary={'polygon' in node ? node.polygon : undefined}
        items={previewItems}
        mode="structure"
      />
      <div className="telxius-elevator">
        <span>ELEVATOR</span>
        <div>
          {items.map(({ node: level, href }, index) => (
            <Link
              key={level.id}
              href={href}
              className={level.id === activeItemId ? 'is-active' : ''}
              aria-current={level.id === activeItemId ? 'page' : undefined}
            >
              <small>↑</small>
              <b>{index + 1}</b>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function LevelCanvas({ items }: { items: readonly VisualStageChild[] }) {
  return <PhysicalPolygonStage boundary={undefined} items={items} mode="structure" />;
}

function rowIndex(row: string): number {
  const normalized = row.trim().toUpperCase().charCodeAt(0) - 64;
  return Math.max(1, Math.min(8, normalized || 1));
}

function BayCanvas({ items }: { items: readonly VisualStageChild[] }) {
  return (
    <div className="telxius-cluster-focus">
      <div className="telxius-cluster-axis telxius-cluster-axis--top" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <div className="telxius-cluster-axis telxius-cluster-axis--left" aria-hidden="true">
        {['A', 'B', 'C', 'D'].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="telxius-cluster-grid">
        {items.map(({ node, href }) => {
          const gridStyle =
            node.kind === 'POSITION'
              ? {
                  gridColumn: Math.max(1, Math.min(8, node.coordinate.column)),
                  gridRow: rowIndex(node.coordinate.row),
                }
              : undefined;

          return (
            <ChildLink
              key={node.id}
              child={node}
              href={href}
              className="telxius-position-tile"
              {...(gridStyle ? { style: gridStyle } : {})}
            >
              <span className="telxius-position-dot" aria-hidden="true" />
              <span>
                <small>{metadata(node)}</small>
                <strong>{node.name}</strong>
              </span>
              <span className="legacy-stage-enter">↗</span>
            </ChildLink>
          );
        })}
      </div>
    </div>
  );
}

function PositionCanvas({ items }: { items: readonly VisualStageChild[] }) {
  return (
    <div className="telxius-position-focus">
      <div className="telxius-position-guide" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="telxius-position-content">
        {items.map(({ node, href }) => (
          <ChildLink key={node.id} child={node} href={href} className="telxius-position-rack-card">
            <span className="telxius-position-rack-icon">
              <Icon name="box" />
            </span>
            <span>
              <small>{metadata(node)}</small>
              <strong>{node.name}</strong>
            </span>
            <span className="legacy-stage-enter">OPEN ↗</span>
          </ChildLink>
        ))}
      </div>
    </div>
  );
}

export function TopologyVisualStage({
  node,
  items,
  previewItems = [],
  activeItemId,
}: Readonly<{
  node: TopologyNode;
  items: readonly VisualStageChild[];
  previewItems?: readonly VisualStageChild[];
  activeItemId?: string | undefined;
}>) {
  let canvas: ReactNode;

  if (node.kind === 'NETWORK') {
    canvas = <NetworkSiteCanvas items={items} />;
  } else if (node.kind === 'SITE') {
    canvas = <PhysicalPolygonStage boundary={node.polygon} items={items} mode="site" />;
  } else if (node.kind === 'STRUCTURE') {
    canvas = (
      <StructureCanvas
        node={node}
        items={items}
        previewItems={previewItems}
        activeItemId={activeItemId}
      />
    );
  } else if (node.kind === 'LEVEL') {
    canvas = <LevelCanvas items={items} />;
  } else if (node.kind === 'CONTAINER_CLUSTER_BAY') {
    canvas = <BayCanvas items={items} />;
  } else if (node.kind === 'POSITION') {
    canvas = <PositionCanvas items={items} />;
  } else {
    canvas = (
      <div className="legacy-generic-canvas">
        {items.map(({ node: child, href }, index) => (
          <ChildLink
            key={child.id}
            child={child}
            href={href}
            style={{ '--node-order': index } as CSSProperties}
          />
        ))}
      </div>
    );
  }

  return (
    <section
      className={`topology-visual-stage legacy-visual-stage legacy-visual-stage--${node.kind.toLowerCase()}`}
    >
      <header className="legacy-stage-toolbar">
        <div>
          <strong>{titleFor(node)}</strong>
          <span>
            {node.kind === 'SITE' || node.kind === 'STRUCTURE' || node.kind === 'LEVEL'
              ? 'Physical layout · canonical surveyed geometry'
              : node.kind === 'CONTAINER_CLUSTER_BAY'
                ? 'Focused cluster context · canonical position coordinates'
                : node.kind === 'POSITION'
                  ? 'Selected position · contained rack or cabinet'
                  : 'Canonical infrastructure context'}
          </span>
        </div>
        <StatusBadge>{items.length} CONTAINED</StatusBadge>
      </header>

      <div className="legacy-stage-canvas">
        {items.length === 0 ? (
          <div className="legacy-stage-empty">
            <Icon name="box" />
            <strong>No contained infrastructure</strong>
          </div>
        ) : (
          canvas
        )}
      </div>
    </section>
  );
}
