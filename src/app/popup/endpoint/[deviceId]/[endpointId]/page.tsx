import { redirect } from 'next/navigation';

import { PopupChrome } from '@/components/popup/popup-chrome';
import { PopupDeviceSurface } from '@/components/popup/popup-device-surface';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function EndpointPopupPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ deviceId: string; endpointId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');

  const { deviceId, endpointId } = await params;
  const query = await searchParams;
  const repository = await createTopologyRepository();
  const device = await repository.getById(deviceId);

  if (!device || device.kind !== 'DEVICE' || !device.bdfb) return null;

  const endpointContext = device.bdfb.shelves.flatMap((shelf) =>
    shelf.frames.flatMap((frame) =>
      frame.panels.flatMap((panel) =>
        panel.endpoints
          .filter((endpoint) => endpoint.id === endpointId)
          .map((endpoint) => ({ shelf, frame, panel, endpoint })),
      ),
    ),
  )[0];

  if (!endpointContext) return null;

  const shelfId =
    typeof query.shelf === 'string' ? query.shelf : endpointContext.shelf.id;
  const panelId =
    typeof query.panel === 'string' ? query.panel : endpointContext.panel.id;

  return (
    <PopupChrome
      eyebrow={endpointContext.endpoint.variant}
      title={endpointContext.endpoint.label}
      subtitle={`${device.name} · ${endpointContext.panel.label}`}
    >
      <PopupDeviceSurface
        deviceId={deviceId}
        focus={{ shelf: shelfId, panel: panelId, endpoint: endpointId }}
        powerReadable={hasPermission(auth.value.role, 'power:read')}
      />
    </PopupChrome>
  );
}
