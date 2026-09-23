import {
  DataView,
  EntityRow,
  SectionHeader,
  StatePanel,
  StatusBadge,
} from '@/shared/ui/primitives';
import { InspectButton } from '@/shared/ui/entity-inspector';
import { topologyInspector } from '@/shared/ui/entity-adapters';
import { PinButton } from '@/components/workspace/pin-button';
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

      <SectionHeader
        eyebrow={node.kind.replaceAll('_', ' ')}
        title={node.name}
        actions={
          <>
            <StatusBadge>{node.lifecycle}</StatusBadge>
            <InspectButton entity={topologyInspector(node)} />
            {(node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') && canWrite && (
              <PinButton id={node.id} initialPinned={node.pinned} />
            )}
          </>
        }
      />
      {node.kind === 'CONTAINER_RACK' && node.variant === 'RACK' && (
        <div className="node-actions">
          <Link className="action-link" href={`/rack/${node.id}`}>
            Open Rack Elevation →
          </Link>
        </div>
      )}
      {node.kind === 'DEVICE' && node.bdfb && (
        <section className="panel">
          <h2>Power distribution structure</h2>
          <DataView label="BDFB internals">
            {node.bdfb.shelves.flatMap((shelf) =>
              shelf.frames.flatMap((frame) =>
                frame.panels.map((panel) => (
                  <section key={panel.id}>
                    <EntityRow
                      name={panel.label}
                      kind="PANEL"
                      metadata={`${shelf.label} / ${frame.label}`}
                      actions={
                        <InspectButton
                          entity={{
                            name: panel.label,
                            kind: 'PANEL',
                            sections: [
                              {
                                title: 'Overview',
                                fields: [
                                  { label: 'Shelf', value: shelf.label },
                                  { label: 'Frame', value: frame.label },
                                  { label: 'Endpoints', value: panel.endpoints.length },
                                ],
                              },
                            ],
                          }}
                        />
                      }
                    />
                    {panel.endpoints.map((endpoint) => (
                      <EntityRow
                        key={endpoint.id}
                        name={endpoint.label}
                        kind={endpoint.variant}
                        metadata={panel.label}
                        actions={
                          <InspectButton
                            entity={{
                              name: endpoint.label,
                              kind: endpoint.variant,
                              sections: [
                                {
                                  title: 'Overview',
                                  fields: [
                                    { label: 'Panel', value: panel.label },
                                    {
                                      label: 'Capacity',
                                      value: endpoint.capacity ?? 'Not specified',
                                    },
                                    { label: 'Endpoint ID', value: endpoint.id },
                                  ],
                                },
                              ],
                            }}
                          />
                        }
                      />
                    ))}
                  </section>
                )),
              ),
            )}
          </DataView>
        </section>
      )}

      {node.kind === 'ROOM_SUBSTRUCTURE' && (
        <div className="node-actions">
          <Link className="action-link" href={`/blueprint/${node.id}`}>
            Open Blueprint
          </Link>
        </div>
      )}

      <section className="panel">
        <h2>Contained infrastructure</h2>
        {children.length === 0 ? (
          <StatePanel
            title="No contained entities"
            description="This entity has no active children."
          />
        ) : (
          <DataView label="Contained entities">
            {await Promise.all(
              children.map(async (child) => (
                <EntityRow
                  key={child.id}
                  name={child.name}
                  kind={child.kind}
                  href={await service.buildDeepLink(child.id)}
                  actions={
                    <InspectButton
                      entity={topologyInspector(child, await service.buildDeepLink(child.id))}
                    />
                  }
                />
              )),
            )}
          </DataView>
        )}
      </section>

      {canWrite &&
        childKinds.map((kind) => (
          <details className="edit-disclosure" key={kind}>
            <summary>Edit · Create {kind.replaceAll('_', ' ').toLowerCase()}</summary>
            <TopologyCreateForm kind={kind} parentId={node.id} />
          </details>
        ))}
    </main>
  );
}
