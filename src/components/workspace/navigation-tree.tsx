'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { WorkspaceTreeNode } from '@/modules/workspace/application/workspace-service';
import type { AlarmRollup } from '@/modules/alarm/domain/entities';
import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';
import { Icon, StatePanel } from '@/shared/ui/primitives';

function matches(node: WorkspaceTreeNode, query: string): boolean {
  return (
    node.name.toLowerCase().includes(query) || node.children.some((child) => matches(child, query))
  );
}
function Branch({
  node,
  query,
  pathname,
  rollups,
}: {
  node: WorkspaceTreeNode;
  query: string;
  pathname: string;
  rollups: Readonly<Record<string, AlarmRollup>>;
}) {
  const [expanded, setExpanded] = useState(false);
  const children = node.children.filter((child) => matches(child, query));
  return (
    <li>
      <div className="tree-node-line">
        {node.children.length ? (
          <button
            className="tree-toggle"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
            aria-expanded={!!query || expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {query || expanded ? '⌄' : '›'}
          </button>
        ) : (
          <span className="tree-spacer" />
        )}
        <Link
          href={node.href}
          aria-current={pathname === node.href ? 'page' : undefined}
          title={node.name}
        >
          <Icon
            name={node.kind === 'NETWORK' ? 'network' : node.kind.includes('ROOM') ? 'room' : 'box'}
          />
          <span>{node.name}</span>
          {node.children.length > 0 && <small>{node.children.length}</small>}
          {rollups[node.id]?.activeAlarmCount ? (
            <span
              className="sm-tree-alarm-badge"
              data-severity={rollups[node.id]!.highestSeverity ?? 'INFO'}
              title={rollups[node.id]!.activeAlarmCount + ' active alarm(s) in this branch'}
            >
              {rollups[node.id]!.activeAlarmCount}
            </span>
          ) : null}
        </Link>
      </div>
      {children.length > 0 && (query || expanded) && (
        <ul>
          {children.map((child) => (
            <Branch key={child.id} node={child} query={query} pathname={pathname} rollups={rollups} />
          ))}
        </ul>
      )}
    </li>
  );
}
export function NavigationTree({ roots }: { roots: readonly WorkspaceTreeNode[] }) {
  const [query, setQuery] = useState('');
  const pathname = usePathname();
  const filtered = roots.filter((node) => matches(node, query.toLowerCase()));
  const { snapshot } = useAlarmSnapshot();
  const t = useTranslations('workspaceUi');
  return (
    <nav className="workspace-tree" aria-label={t('topology')}>
      <div className="workspace-section-title">
        <span>{t('topology')}</span>
        <b>⌄</b>
      </div>
      <input
        type="search"
        aria-label={t('searchTop')}
        placeholder={t('searchInfra')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {!filtered.length ? (
        <StatePanel
          title={query ? t('noMatchingEntities') : t('noTopology')}
          description={query ? t('tryAnother') : t('createNetwork')}
        />
      ) : (
        <ul>
          {filtered.map((node) => (
            <Branch key={node.id} node={node} query={query.toLowerCase()} pathname={pathname} rollups={snapshot.rollups} />
          ))}
        </ul>
      )}
    </nav>
  );
}
