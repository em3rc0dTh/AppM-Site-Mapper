'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';

import type { TopologyNavigationNode } from '@/modules/topology/application/topology-service';
import type { TopologyKind } from '@/modules/topology/domain/entities';
import { Icon } from '@/shared/ui/primitives';
import type { AlarmRollup } from '@/modules/alarm/domain/entities';
import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';

function iconFor(kind: TopologyKind): string {
  if (kind === 'NETWORK') return 'network';
  if (kind === 'ROOM_SUBSTRUCTURE') return 'room';
  return 'box';
}

type TopologyKindLabel =
  | 'network'
  | 'site'
  | 'structure'
  | 'level'
  | 'room'
  | 'bay'
  | 'position'
  | 'rack'
  | 'device'
  | 'equipment';

function labelFor(kind: TopologyKind): TopologyKindLabel {
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

function navigationChildren(node: TopologyNavigationNode): readonly TopologyNavigationNode[] {
  return node.children.filter(
    (child) =>
      child.node.kind !== 'EQUIPMENT' || child.node.equipmentType !== 'CIRCUIT_BREAKER',
  );
}

function containsActive(node: TopologyNavigationNode, id: string): boolean {
  return (
    node.node.id === id ||
    navigationChildren(node).some((child) => containsActive(child, id))
  );
}

function TreeBranch({
  item,
  activeId,
  selectedId,
  depth,
  onSelect,
  onOpen,
  rollups,
}: Readonly<{
  item: TopologyNavigationNode;
  activeId: string;
  selectedId: string | null;
  depth: number;
  onSelect: (item: TopologyNavigationNode) => void;
  onOpen: (item: TopologyNavigationNode) => void;
  rollups: Readonly<Record<string, AlarmRollup>>;
}>) {
  const t = useTranslations('topologyTree');
  const active = item.node.id === activeId;
  const chosen = item.node.id === selectedId;
  const alarmedBranch = Boolean(rollups[item.node.id]?.activeAlarmCount);
  const expanded =
    depth < 3 ||
    containsActive(item, activeId) ||
    alarmedBranch ||
    (selectedId !== null && containsActive(item, selectedId));

  const visibleChildren = navigationChildren(item);

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
        {rollups[item.node.id]?.activeAlarmCount ? (
          <span
            className="sm-tree-alarm-badge"
            data-severity={rollups[item.node.id]!.highestSeverity ?? 'INFO'}
            title={t('activeAlarmsInBranch', { count: rollups[item.node.id]!.activeAlarmCount })}
          >
            {rollups[item.node.id]!.activeAlarmCount}
          </span>
        ) : null}
        {visibleChildren.length > 0 && (
          <span className="telxius-tree-chevron" aria-hidden="true">
            {expanded ? '⌄' : '›'}
          </span>
        )}
      </Link>
      {expanded && visibleChildren.length > 0 && (
        <ul>
          {visibleChildren.map((child) => (
            <TreeBranch
              key={child.node.id}
              item={child}
              activeId={activeId}
              selectedId={selectedId}
              depth={depth + 1}
              onSelect={onSelect}
              onOpen={onOpen}
              rollups={rollups}
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
  const [collapsed, setCollapsed] = useState(false);
  const treeContent = useRef<HTMLDivElement>(null);
  const { snapshot } = useAlarmSnapshot();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      treeContent.current
        ?.querySelector<HTMLElement>('a[aria-current="page"]')
        ?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeId]);

  return (
    <nav
      className="telxius-topology-tree"
      aria-label={t('global')}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <button
        type="button"
        className="telxius-tree-collapse-toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? t('expandTree') : t('collapseTree')}
        title={collapsed ? t('expandTree') : t('collapseTree')}
        onClick={() => setCollapsed((value) => !value)}
      >
        {collapsed ? '›' : '‹'}
      </button>
      <div className="telxius-tree-collapsible-content" ref={treeContent}>
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
            rollups={snapshot.rollups}
          />
        </ul>
        {selected && (
          <div className="topology-tree-selection" role="status">
            <span>{t(`kinds.${labelFor(selected.node.kind)}`)}</span>
            <strong title={selected.node.name}>{selected.node.name}</strong>
            <small>{t('directChildren', { count: navigationChildren(selected).length })}</small>
            <Link href={selected.href} prefetch={false}>
              {t('open')}
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
