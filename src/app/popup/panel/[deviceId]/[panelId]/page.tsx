import { redirect } from 'next/navigation';

import { PopupChrome } from '@/components/popup/popup-chrome';
import { PopupDeviceSurface } from '@/components/popup/popup-device-surface';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function PanelPopupPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ deviceId: string; panelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');

  const { deviceId, panelId } = await params;
  const query = await searchParams;
  const repository = await createTopologyRepository();
  const device = await repository.getById(deviceId);

  if (!device || device.kind !== 'DEVICE' || !device.bdfb) return null;

  const panelContext = device.bdfb.shelves.flatMap((shelf) =>
    shelf.frames.flatMap((frame) =>
      frame.panels
        .filter((panel) => panel.id === panelId)
        .map((panel) => ({ shelf, frame, panel })),
    ),
  )[0];

  if (!panelContext) return null;

  const shelfId = typeof query.shelf === 'string' ? query.shelf : panelContext.shelf.id;

  return (
    <PopupChrome
      eyebrow="Distribution Panel"
      title={panelContext.panel.label}
      subtitle={`${device.name} · ${panelContext.shelf.label} · ${panelContext.frame.label}`}
    >
      <PopupDeviceSurface
        deviceId={deviceId}
        focus={{ shelf: shelfId, panel: panelId }}
        powerReadable={hasPermission(auth.value.role, 'power:read')}
        mode="panel"
      />
    </PopupChrome>
  );
}
