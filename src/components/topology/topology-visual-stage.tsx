import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

import type { TopologyNode } from '@/modules/topology/domain/entities';
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
      <div className="legacy-site-boundary">
        {items.map(({ node, href }, index) => (
          <ChildLink
            key={node.id}
            child={node}
            href={href}
            className="legacy-site-footprint"
          >
            <span className="legacy-site-footprint-crosshair" aria-hidden="true">+</span>
            <span>
              <small>{metadata(node)}</small>
              <strong>{node.name}</strong>
            </span>
            <span className="legacy-stage-enter">↗</span>
          </ChildLink>
        ))}
      </div>
    </div>
  );
}

function StructureCanvas({ items }: { items: readonly VisualStageChild[] }) {
  return (
    <div className="legacy-structure-canvas">
      <div className="legacy-building-outline">
        {items.length === 0 ? (
          <div className="legacy-stage-empty">No active levels</div>
        ) : (
          [...items].reverse().map(({ node, href }, index) => (
            <ChildLink
              key={node.id}
              child={node}
              href={href}
              className="legacy-level-slab"
            >
              <span className="legacy-level-number">
                {(items.length - index).toString().padStart(2, '0')}
              </span>
              <span>
                <small>LEVEL</small>
                <strong>{node.name}</strong>
              </span>
              <span className="legacy-level-status">OPEN →</span>
            </ChildLink>
          ))
        )}
      </div>
    </div>
  );
}

function LevelCanvas({ items }: { items: readonly VisualStageChild[] }) {
  return (
    <div className="legacy-level-canvas">
      <div className="legacy-level-grid" aria-hidden="true" />
      <div className="legacy-room-field">
        {items.map(({ node, href }, index) => (
          <ChildLink
            key={node.id}
            child={node}
            href={href}
            className="legacy-room-footprint"
          >
            <span className="legacy-room-index">{String.fromCharCode(65 + (index % 26))}</span>
            <span>
              <small>{metadata(node)}</small>
              <strong>{node.name}</strong>
            </span>
            <span className="legacy-stage-enter">↗</span>
          </ChildLink>
        ))}
      </div>
    </div>
  );
}

function BayCanvas({ items }: { items: readonly VisualStageChild[] }) {
  return (
    <div className="legacy-bay-canvas">
      <div className="legacy-bay-axis legacy-bay-axis--top">
        {Array.from({ length: 8 }, (_, i) => <span key={i}>{i + 1}</span>)}
      </div>
      <div className="legacy-bay-axis legacy-bay-axis--left">
        {['A', 'B', 'C', 'D'].map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="legacy-position-grid">
        {items.map(({ node, href }) => (
          <ChildLink key={node.id} child={node} href={href} className="legacy-position-tile">
            <span className="legacy-position-marker">
              <Icon name="box" />
            </span>
            <span>
              <small>{metadata(node)}</small>
              <strong>{node.name}</strong>
            </span>
          </ChildLink>
        ))}
      </div>
    </div>
  );
}

function PositionCanvas({ items }: { items: readonly VisualStageChild[] }) {
  return (
    <div className="legacy-position-canvas">
      {items.map(({ node, href }) => (
        <ChildLink key={node.id} child={node} href={href} className="legacy-cabinet-preview">
          <div className="legacy-cabinet-top" />
          <div className="legacy-cabinet-body">
            <span className="legacy-cabinet-rails" aria-hidden="true" />
            <span>
              <small>{metadata(node)}</small>
              <strong>{node.name}</strong>
            </span>
          </div>
          <div className="legacy-cabinet-bottom" />
        </ChildLink>
      ))}
    </div>
  );
}

export function TopologyVisualStage({
  node,
  items,
}: Readonly<{
  node: TopologyNode;
  items: readonly VisualStageChild[];
}>) {
  let canvas: ReactNode;

  if (node.kind === 'NETWORK' || node.kind === 'SITE') {
    canvas = <NetworkSiteCanvas items={items} />;
  } else if (node.kind === 'STRUCTURE') {
    canvas = <StructureCanvas items={items} />;
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
    <section className={`topology-visual-stage legacy-visual-stage legacy-visual-stage--${node.kind.toLowerCase()}`}>
      <header className="legacy-stage-toolbar">
        <div>
          <strong>{titleFor(node)}</strong>
          <span>Operational view · schematic geometry where surveyed coordinates are unavailable</span>
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
