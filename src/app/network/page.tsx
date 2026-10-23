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
import { getTranslations } from 'next-intl/server';

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

  if (networks.length === 1) {
    const network = networks[0]!;

    redirect(await service.buildDeepLink(network.id));
  }

  const t = await getTranslations('pages.network');
  return (
    <main className="workspace-shell telxius-network-index">
      <SectionHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={<StatusBadge>{canWrite ? t('write') : t('read')}</StatusBadge>}
      />

      <section className="panel">
        <h2>{t('roots')}</h2>
        {networks.length === 0 ? (
          <StatePanel title={t('emptyTitle')} description={t('emptyDescription')} />
        ) : (
          <DataView label={t('networks')}>
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
