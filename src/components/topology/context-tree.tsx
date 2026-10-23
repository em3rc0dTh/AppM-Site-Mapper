'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type CSSProperties, type MouseEvent } from 'react';

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
      return 'network';
    case 'SITE':
      return 'site';
    case 'STRUCTURE':
      return 'structure';
    case 'LEVEL':
      return 'level';
    case 'ROOM_SUBSTRUCTURE':
      return 'room';
    case 'CONTAINER_CLUSTER_BAY':
      return 'bay';
    case 'POSITION':
      return 'position';
    case 'CONTAINER_RACK':
      return 'rack';
    case 'DEVICE':
      return 'device';
    case 'EQUIPMENT':
      return 'equipment';
  }
}

function containsActive(node: TopologyNavigationNode, id: string): boolean {
  return node.node.id === id || node.children.some((child) => containsActive(child, id));
}

function TreeBranch({
  item,
  activeId,
  selectedId,
  depth,
  onSelect,
  onOpen,
}: Readonly<{
  item: TopologyNavigationNode;
  activeId: string;
  selectedId: string | null;
  depth: number;
  onSelect: (item: TopologyNavigationNode) => void;
  onOpen: (item: TopologyNavigationNode) => void;
}>) {
  const t = useTranslations('topologyTree');
  const active = item.node.id === activeId;
  const chosen = item.node.id === selectedId;
  const expanded =
    depth < 3 ||
    containsActive(item, activeId) ||
    (selectedId !== null && containsActive(item, selectedId));

  const select = (event: MouseEvent<HTMLAnchorElement>) => {
    // Keyboard Enter opens the link; a pointer's first click only inspects.
    if (event.detail > 0) event.preventDefault();
    onSelect(item);
  };

  return (
    <li className="telxius-tree-node">
      <Link
        className={`${active ? 'is-active' : ''}${chosen ? ' is-selected' : ''}`}
        href={item.href}
        prefetch={false}
        aria-current={active ? 'page' : undefined}
        aria-label={t('inspectHelp', { name: item.node.name })}
        title={item.node.name}
        style={{ '--tree-depth': depth } as CSSProperties}
        onClick={select}
        onDoubleClick={(event) => {
          event.preventDefault();
          onOpen(item);
        }}
      >
        <span className="telxius-tree-guide" aria-hidden="true" />
        <Icon name={iconFor(item.node.kind)} />
        <span className="telxius-tree-copy">
          <small>{t(`kinds.${labelFor(item.node.kind)}`)}</small>
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
            <TreeBranch
              key={child.node.id}
              item={child}
              activeId={activeId}
              selectedId={selectedId}
              depth={depth + 1}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TopologyContextTree({
  tree,
  activeId,
}: Readonly<{ tree: TopologyNavigationNode; activeId: string }>) {
  const t = useTranslations('topologyTree');
  const router = useRouter();
  const [selected, setSelected] = useState<TopologyNavigationNode | null>(null);

  return (
    <nav className="telxius-topology-tree" aria-label={t('global')}>
      <header className="telxius-tree-brand">
        <span className="telxius-tree-brand-icon">
          <Icon name="network" />
        </span>
        <strong>APPMANAGER</strong>
        <Link href="/workspace">{t('home')}</Link>
      </header>
      <div className="telxius-tree-heading">
        <span>{t('topology')}</span>
        <b>{t('all')}</b>
      </div>
      <ul className="telxius-tree-root">
        <TreeBranch
          item={tree}
          activeId={activeId}
          selectedId={selected?.node.id ?? null}
          depth={0}
          onSelect={setSelected}
          onOpen={(item) => router.push(item.href)}
        />
      </ul>
      {selected && (
        <div className="topology-tree-selection" role="status">
          <span>{t(`kinds.${labelFor(selected.node.kind)}`)}</span>
          <strong title={selected.node.name}>{selected.node.name}</strong>
          <small>{t('directChildren', { count: selected.children.length })}</small>
          <Link href={selected.href} prefetch={false}>
            {t('open')}
          </Link>
        </div>
      )}
    </nav>
  );
}
