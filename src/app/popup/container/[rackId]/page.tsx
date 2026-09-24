import { notFound, redirect } from 'next/navigation';

import { PopupChrome } from '@/components/popup/popup-chrome';
import { RackElevation } from '@/components/rack/rack-elevation';
import { requirePermission } from '@/modules/identity/application/current-session';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function ContainerPopupPage({
  params,
}: Readonly<{ params: Promise<{ rackId: string }> }>) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');

  const { rackId } = await params;
  const repository = await createTopologyRepository();
  const result = await new RackElevationService(repository).getView(rackId);

  if (!result.ok) notFound();

  const parent = result.value.rack.parentId
    ? await repository.getById(result.value.rack.parentId)
    : null;

  return (
    <PopupChrome
      eyebrow="Container / Rack"
      title={result.value.rack.name}
      subtitle="Physical rack elevation · popup workspace"
    >
      <RackElevation
        view={result.value}
        {...(parent?.kind === 'POSITION'
          ? {
              context: {
                positionName: parent.name,
                coordinate: `${parent.coordinate.row}-${parent.coordinate.column}`,
              },
            }
          : {})}
      />
    </PopupChrome>
  );
}
