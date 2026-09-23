import Link from 'next/link';

import type { TopologyNode } from '@/modules/topology/domain/entities';
import { Icon, StatusBadge } from '@/shared/ui/primitives';

export interface VisualStageChild {
  readonly node: TopologyNode;
  readonly href: string;
}

function metadata(node: TopologyNode): string {
  switch (node.kind) {
    case 'POSITION':
      return `${node.coordinate.row}${node.coordinate.column}`;
    case 'CONTAINER_RACK':
      return node.variant === 'RACK' && node.totalU ? `${node.totalU}U RACK` : node.variant;
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

function stageLabel(node: TopologyNode): string {
  switch (node.kind) {
    case 'NETWORK':
      return 'Network topology schematic';
    case 'SITE':
      return 'Site infrastructure canvas';
    case 'STRUCTURE':
      return 'Structure / level stack';
    case 'LEVEL':
      return 'Level spatial schematic';
    case 'CONTAINER_CLUSTER_BAY':
      return 'Bay / position matrix';
    case 'POSITION':
      return 'Physical position';
    case 'DEVICE':
      return 'Device operational surface';
    case 'EQUIPMENT':
      return 'Equipment operational surface';
    default:
      return 'Infrastructure view';
  }
}

export function TopologyVisualStage({
  node,
  children,
}: Readonly<{
  node: TopologyNode;
  children: readonly VisualStageChild[];
}>) {
  return (
    <section className={`topology-visual-stage topology-visual-stage--${node.kind.toLowerCase()}`}>
      <header className="topology-visual-toolbar">
        <div>
          <span>{stageLabel(node)}</span>
          <small>Operational schematic · visual placement is not a survey drawing</small>
        </div>
        <StatusBadge>{children.length} CONTAINED</StatusBadge>
      </header>

      <div className="topology-visual-canvas">
        <div className="topology-visual-grid" aria-hidden="true" />
        <div className="topology-node-field">
          {children.length === 0 ? (
            <div className="topology-empty-node">
              <Icon name="box" />
              <strong>No contained infrastructure</strong>
              <span>The canonical entity exists, but it has no active children.</span>
            </div>
          ) : (
            children.map(({ node: child, href }, index) => (
              <Link
                key={child.id}
                href={href}
                className={`topology-visual-node topology-visual-node--${child.kind.toLowerCase()}`}
                style={{ '--node-order': index } as React.CSSProperties}
              >
                <span className="topology-node-icon">
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
                <span className="topology-node-copy">
                  <small>{metadata(child)}</small>
                  <strong>{child.name}</strong>
                </span>
                <span className="topology-node-enter" aria-hidden="true">
                  ↗
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
