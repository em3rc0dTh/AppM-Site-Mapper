import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { TopologyCreateForm } from '@/components/topology/topology-create-form';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { allowedChildKinds } from '@/modules/topology/domain/hierarchy';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function TopologyNodePage({
  params,
}: Readonly<{ params: Promise<{ path: string[] }> }>) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const { path } = await params;
  const service = new TopologyService(await createTopologyRepository());
  const resolved = await service.resolveDeepLink(path);

  if (!resolved.ok) {
    notFound();
  }

  const node = resolved.value;
  const trail = await service.getTrail(node.id);
  const children = await service.listChildren(node.id);
  const childKinds = allowedChildKinds(node.kind);
  const canWrite = hasPermission(auth.value.role, 'topology:write');

  return (
    <main className="workspace-shell">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/network">Network index</Link>
        {await Promise.all(
          trail.map(async (item) => (
            <Link key={item.id} href={await service.buildDeepLink(item.id)}>
              {item.name}
            </Link>
          )),
        )}
      </nav>

      <header className="workspace-header">
        <div>
          <p className="eyebrow">{node.kind.replaceAll('_', ' ')}</p>
          <h1>{node.name}</h1>
        </div>
        <span>{node.lifecycle}</span>
      </header>

      {node.kind === 'ROOM_SUBSTRUCTURE' && (
        <div className="node-actions">
          <Link className="action-link" href={`/blueprint/${node.id}`}>
            Open Blueprint
          </Link>
        </div>
      )}

      <section className="panel">
        <h2>Children</h2>
        {children.length === 0 ? (
          <p>No active children.</p>
        ) : (
          <ul className="node-list">
            {await Promise.all(
              children.map(async (child) => (
                <li key={child.id}>
                  <Link href={await service.buildDeepLink(child.id)}>{child.name}</Link>
                  <span>{child.kind.replaceAll('_', ' ')}</span>
                </li>
              )),
            )}
          </ul>
        )}
      </section>

      {canWrite &&
        childKinds.map((kind) => <TopologyCreateForm key={kind} kind={kind} parentId={node.id} />)}
    </main>
  );
}
