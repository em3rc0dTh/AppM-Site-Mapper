import {
  DataView,
  EntityRow,
  SectionHeader,
  StatePanel,
  StatusBadge,
} from '@/shared/ui/primitives';
import { InspectButton } from '@/shared/ui/entity-inspector';
import { topologyInspector } from '@/shared/ui/entity-adapters';
import { redirect } from 'next/navigation';

import { TopologyCreateForm } from '@/components/topology/topology-create-form';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function NetworkPage() {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const service = new TopologyService(await createTopologyRepository());
  const networks = await service.listNetworksIncludingArchived();
  const canWrite = hasPermission(auth.value.role, 'topology:write');

  return (
    <main className="workspace-shell">
      <SectionHeader
        eyebrow="Infrastructure / topology"
        title="Network"
        description="Explore your sites and the physical hierarchy beneath them."
        actions={<StatusBadge>{canWrite ? 'EDIT PERMITTED' : 'READ ONLY'}</StatusBadge>}
      />

      <section className="panel">
        <h2>Topology roots</h2>
        {networks.length === 0 ? (
          <StatePanel
            title="No networks yet"
            description="Create the first network to start organizing sites, rooms and racks."
          />
        ) : (
          <DataView label="Networks">
            {await Promise.all(
              networks.map(async (network) => (
                <EntityRow
                  key={network.id}
                  name={network.name}
                  kind={network.kind}
                  href={await service.buildDeepLink(network.id)}
                  status={<StatusBadge>{network.lifecycle}</StatusBadge>}
                  actions={
                    <InspectButton
                      entity={topologyInspector(network, await service.buildDeepLink(network.id))}
                    />
                  }
                />
              )),
            )}
          </DataView>
        )}
      </section>

      {canWrite && <TopologyCreateForm kind="NETWORK" parentId={null} />}
    </main>
  );
}
