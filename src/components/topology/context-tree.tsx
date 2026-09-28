import Link from 'next/link';
import type { CSSProperties } from 'react';

import type { TopologyNavigationNode } from '@/modules/topology/application/topology-service';
import type { TopologyKind } from '@/modules/topology/domain/entities';
import { Icon } from '@/shared/ui/primitives';

function iconFor(kind: TopologyKind): string {
  if (kind === 'NETWORK') return 'network';
  if (kind === 'ROOM_SUBSTRUCTURE') return 'room';
  return 'box';
}

function labelFor(kind: TopologyKind): string {
  switch (kind) {
    case 'NETWORK':
      return 'NETWORK';
    case 'SITE':
      return 'SITE';
    case 'STRUCTURE':
      return 'STRUCTURE';
    case 'LEVEL':
      return 'LEVEL';
    case 'ROOM_SUBSTRUCTURE':
      return 'ROOM';
    case 'CONTAINER_CLUSTER_BAY':
      return 'CLUSTER';
    case 'POSITION':
      return 'POSITION';
    case 'CONTAINER_RACK':
      return 'RACK';
    case 'DEVICE':
      return 'DEVICE';
    case 'EQUIPMENT':
      return 'EQUIPMENT';
  }
}

function containsActive(node: TopologyNavigationNode, activeId: string): boolean {
  return node.node.id === activeId || node.children.some((child) => containsActive(child, activeId));
}

function TreeBranch({
  item,
  activeId,
  depth,
}: Readonly<{
  item: TopologyNavigationNode;
  activeId: string;
  depth: number;
}>) {
  const active = item.node.id === activeId;
  const expanded = containsActive(item, activeId) || depth < 2;

  return (
    <li className="telxius-tree-node">
      <Link
        className={active ? 'is-active' : ''}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        style={{ '--tree-depth': depth } as CSSProperties}
      >
        <span className="telxius-tree-guide" aria-hidden="true" />
        <Icon name={iconFor(item.node.kind)} />
        <span className="telxius-tree-copy">
          <small>{labelFor(item.node.kind)}</small>
          <strong>{item.node.name}</strong>
        </span>
        {item.children.length > 0 && (
          <span className="telxius-tree-chevron" aria-hidden="true">
            {expanded ? '⌄' : '›'}
          </span>
        )}
      </Link>

      {expanded && item.children.length > 0 && (
        <ul>
          {item.children.map((child) => (
            <TreeBranch key={child.node.id} item={child} activeId={activeId} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TopologyContextTree({
  tree,
  activeId,
}: Readonly<{
  tree: TopologyNavigationNode;
  activeId: string;
}>) {
  return (
    <nav className="telxius-topology-tree" aria-label="Global topology">
      <header className="telxius-tree-brand">
        <span className="telxius-tree-brand-icon">
          <Icon name="network" />
        </span>
        <strong>APPMANAGER</strong>
        <Link href="/workspace">Home</Link>
      </header>

      <div className="telxius-tree-heading">
        <span>GLOBAL TOPOLOGY</span>
        <b>ALL</b>
      </div>

      <ul className="telxius-tree-root">
        <TreeBranch item={tree} activeId={activeId} depth={0} />
      </ul>
    </nav>
  );
}
