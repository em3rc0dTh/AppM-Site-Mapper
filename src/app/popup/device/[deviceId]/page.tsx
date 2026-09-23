import { redirect } from 'next/navigation';

import { PopupChrome } from '@/components/popup/popup-chrome';
import { PopupDeviceSurface } from '@/components/popup/popup-device-surface';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function DevicePopupPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ deviceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');

  const { deviceId } = await params;
  const query = await searchParams;
  const repository = await createTopologyRepository();
  const device = await repository.getById(deviceId);

  if (!device || (device.kind !== 'DEVICE' && device.kind !== 'EQUIPMENT')) {
    return null;
  }

  const focus = Object.fromEntries(
    ['shelf', 'panel', 'endpoint', 'path'].flatMap((key) =>
      typeof query[key] === 'string' ? [[key, query[key]]] : [],
    ),
  );

  return (
    <PopupChrome
      eyebrow={device.kind}
      title={device.name}
      subtitle="Physical equipment workspace"
    >
      <PopupDeviceSurface
        deviceId={deviceId}
        focus={focus}
        powerReadable={hasPermission(auth.value.role, 'power:read')}
      />
    </PopupChrome>
  );
}
