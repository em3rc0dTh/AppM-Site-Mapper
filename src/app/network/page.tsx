import Link from 'next/link';
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
  const networks = await service.listNetworks();
  const canWrite = hasPermission(auth.value.role, 'topology:write');

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">AppManager · Site Mapper</p>
          <h1>Network</h1>
        </div>
        <span>{auth.value.displayName}</span>
      </header>

      <section className="panel">
        <h2>Topology roots</h2>
        {networks.length === 0 ? (
          <p>No network has been created yet.</p>
        ) : (
          <ul className="node-list">
            {await Promise.all(
              networks.map(async (network) => (
                <li key={network.id}>
                  <Link href={await service.buildDeepLink(network.id)}>{network.name}</Link>
                  <span>{network.kind}</span>
                </li>
              )),
            )}
          </ul>
        )}
      </section>

      {canWrite && <TopologyCreateForm kind="NETWORK" parentId={null} />}
    </main>
  );
}
