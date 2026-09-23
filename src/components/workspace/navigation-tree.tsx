import Link from 'next/link';

import type { WorkspaceTreeNode } from '@/modules/workspace/application/workspace-service';

function Branch({ node }: Readonly<{ node: WorkspaceTreeNode }>) {
  return (
    <li>
      <Link href={node.href}>
        <span>{node.name}</span>
        <small>{node.kind.replaceAll('_', ' ')}</small>
      </Link>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <Branch key={child.id} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function NavigationTree({
  roots,
}: Readonly<{ roots: readonly WorkspaceTreeNode[] }>) {
  return (
    <nav className="workspace-tree" aria-label="Infrastructure topology">
      <div className="workspace-section-title">
        <span>Topology</span>
        <Link href="/network">Manage</Link>
      </div>
      {roots.length === 0 ? (
        <p>No topology has been created.</p>
      ) : (
        <ul className="workspace-tree-root">
          {roots.map((root) => (
            <Branch key={root.id} node={root} />
          ))}
        </ul>
      )}
    </nav>
  );
}
