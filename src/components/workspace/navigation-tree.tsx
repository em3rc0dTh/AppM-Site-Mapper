'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { WorkspaceTreeNode } from '@/modules/workspace/application/workspace-service';
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
}: {
  node: WorkspaceTreeNode;
  query: string;
  pathname: string;
}) {
  const [expanded, setExpanded] = useState(true);
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
          title={node.kind.replaceAll('_', ' ')}
        >
          <Icon
            name={node.kind === 'NETWORK' ? 'network' : node.kind.includes('ROOM') ? 'room' : 'box'}
          />
          <span>{node.name}</span>
          {node.children.length > 0 && <small>{node.children.length}</small>}
        </Link>
      </div>
      {children.length > 0 && (query || expanded) && (
        <ul>
          {children.map((child) => (
            <Branch key={child.id} node={child} query={query} pathname={pathname} />
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
  return (
    <nav className="workspace-tree" aria-label="Infrastructure topology">
      <div className="workspace-section-title">
        <span>Topology explorer</span>
        <Link href="/network">Manage</Link>
      </div>
      <input
        type="search"
        aria-label="Search topology"
        placeholder="Search infrastructure…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {!filtered.length ? (
        <StatePanel
          title={query ? 'No matching entities' : 'No topology yet'}
          description={query ? 'Try another name.' : 'Create a network to map your infrastructure.'}
        />
      ) : (
        <ul>
          {filtered.map((node) => (
            <Branch key={node.id} node={node} query={query.toLowerCase()} pathname={pathname} />
          ))}
        </ul>
      )}
    </nav>
  );
}
