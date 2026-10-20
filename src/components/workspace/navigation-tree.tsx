'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { WorkspaceTreeNode } from '@/modules/workspace/application/workspace-service';
import { Icon, StatePanel } from '@/shared/ui/primitives';

function flatten(nodes: readonly WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

export function NavigationTree({ roots }: { roots: readonly WorkspaceTreeNode[] }) {
  const [query, setQuery] = useState('');
  const [path, setPath] = useState<string[]>([]);
  const pathname = usePathname();
  const nodes = useMemo(() => flatten(roots), [roots]);
  const selected = path.reduce<WorkspaceTreeNode | undefined>(
    (parent, id, index) => (index === 0 ? roots : parent?.children)?.find((node) => node.id === id),
    undefined,
  );
  const normalized = query.trim().toLocaleLowerCase();
  const visible = normalized
    ? nodes.filter((node) => node.name.toLocaleLowerCase().includes(normalized))
    : selected?.children ?? roots;

  return (
    <nav className="workspace-tree sm-flat-tree" aria-label="Infrastructure topology">
      <div className="workspace-section-title"><span>TOPOLOGY</span></div>
      <input
        type="search"
        aria-label="Search topology"
        placeholder="Search infrastructure…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {!normalized && path.length > 0 && (
        <button type="button" className="sm-tree-back" onClick={() => setPath((previous) => previous.slice(0, -1))}>
          ← Back
        </button>
      )}
      {!normalized && selected && <div className="sm-tree-current" title={selected.name}>{selected.name}</div>}
      {!visible.length ? (
        <StatePanel title={normalized ? 'No matching entities' : 'No child entities'} description={normalized ? 'Try another name.' : 'Select a parent from the breadcrumb to navigate.'} />
      ) : (
        <ul className="sm-flat-tree-list">
          {visible.map((node) => (
            <li key={node.id} className="sm-flat-tree-item">
              <Link href={node.href} title={node.name} aria-current={pathname === node.href ? 'page' : undefined}>
                <Icon name={node.kind === 'NETWORK' ? 'network' : node.kind.includes('ROOM') ? 'room' : 'box'} />
                <span>{node.name}</span>
              </Link>
              {node.children.length > 0 && (
                <button type="button" title={`Explore ${node.name}`} aria-label={`Explore children of ${node.name}`} onClick={() => {
                  if (normalized) {
                    const lookup = (list: readonly WorkspaceTreeNode[], target: string, parents: string[] = []): string[] | undefined => {
                      for (const item of list) {
                        if (item.id === target) return [...parents, item.id];
                        const found = lookup(item.children, target, [...parents, item.id]);
                        if (found) return found;
                      }
                      return undefined;
                    };
                    setPath(lookup(roots, node.id) ?? []);
                    setQuery('');
                  } else setPath((current) => [...current, node.id]);
                }}>›</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
