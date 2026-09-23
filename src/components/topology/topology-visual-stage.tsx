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
  items,
  previewItems,
}: {
  items: readonly VisualStageChild[];
  previewItems: readonly VisualStageChild[];
}) {
  const activeLevel = items[0];

  return (
    <div className="legacy-structure-canvas">
      <div className="legacy-structure-grid" aria-hidden="true" />
      <div className="legacy-structure-outline">
        <div className="legacy-structure-title">
          <small>Selected floor</small>
          <strong>{activeLevel?.node.name ?? 'No active level'}</strong>
        </div>

        <div className="legacy-structure-room-map">
          {previewItems.length > 0 ? (
            previewItems.map(({ node, href }, index) => (
              <ChildLink
                key={node.id}
                child={node}
                href={href}
                className={`legacy-structure-room legacy-structure-room--${(index % 3) + 1}`}
              >
                <span>
                  <small>{metadata(node)}</small>
                  <strong>{node.name}</strong>
                </span>
                <span className="legacy-stage-enter">↗</span>
              </ChildLink>
            ))
          ) : (
            <div className="legacy-stage-empty">No rooms on this level</div>
          )}
        </div>
      </div>

      <div className="legacy-floor-switcher">
        <span>FLOORS</span>
        {items.map(({ node, href }, index) => (
          <Link key={node.id} href={href} className={index === 0 ? 'is-active' : ''}>
            {(index + 1).toString().padStart(2, '0')}
          </Link>
        ))}
      </div>
    </div>
  );
}

function LevelCanvas({ items }: { items: readonly VisualStageChild[] }) {
  return (
    <div className="legacy-level-canvas">
      <div className="legacy-level-grid" aria-hidden="true" />
      <div className="legacy-level-boundary">
        <span className="legacy-level-axis legacy-level-axis--x">01 · 02 · 03 · 04 · 05 · 06</span>
        <span className="legacy-level-axis legacy-level-axis--y">A · B · C · D</span>
        <div className="legacy-room-field">
          {items.map(({ node, href }, index) => (
            <ChildLink key={node.id} child={node} href={href} className="legacy-room-footprint">
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
    </div>
  );
}

function BayCanvas({ items }: { items: readonly VisualStageChild[] }) {
  return (
    <div className="legacy-bay-canvas">
      <div className="legacy-bay-axis legacy-bay-axis--top">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <div className="legacy-bay-axis legacy-bay-axis--left">
        {['A', 'B', 'C', 'D'].map((label) => (
          <span key={label}>{label}</span>
        ))}
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
  previewItems = [],
}: Readonly<{
  node: TopologyNode;
  items: readonly VisualStageChild[];
  previewItems?: readonly VisualStageChild[];
}>) {
  let canvas: ReactNode;

  if (node.kind === 'NETWORK' || node.kind === 'SITE') {
    canvas = <NetworkSiteCanvas items={items} />;
  } else if (node.kind === 'STRUCTURE') {
    canvas = <StructureCanvas items={items} previewItems={previewItems} />;
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
            Operational view · schematic geometry where surveyed coordinates are unavailable
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
