import { notFound } from 'next/navigation';

import {
  DevicePhysicalView,
  type ElectricalConnection,
} from '@/components/inventory/device-physical-view';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export interface PopupDeviceFocus {
  readonly shelf?: string;
  readonly panel?: string;
  readonly endpoint?: string;
  readonly path?: string;
}

export async function PopupDeviceSurface({
  deviceId,
  focus,
  powerReadable,
}: Readonly<{
  deviceId: string;
  focus: PopupDeviceFocus;
  powerReadable: boolean;
}>) {
  const repository = await createTopologyRepository();
  const device = await repository.getById(deviceId);

  if (!device || (device.kind !== 'DEVICE' && device.kind !== 'EQUIPMENT')) {
    notFound();
  }

  const rack = device.parentId ? await repository.getById(device.parentId) : null;
  const href = `/popup/device/${device.id}`;
  const connections: ElectricalConnection[] = powerReadable
    ? await Promise.all(
        (await (await createPowerRepository()).listActive())
          .filter(
            (item) => item.source.entityId === device.id || item.target.entityId === device.id,
          )
          .map(async (path) => {
            const [source, target] = await Promise.all([
              repository.getById(path.source.entityId),
              repository.getById(path.target.entityId),
            ]);
            const internal = path.source.internal;
            const shelf =
              source?.kind === 'DEVICE'
                ? source.bdfb?.shelves.find((item) => item.id === internal?.shelfId)
                : undefined;
            const frame = shelf?.frames.find((item) => item.id === internal?.frameId);
            const panel = frame?.panels.find((item) => item.id === internal?.panelId);
            const endpoint = panel?.endpoints.find((item) => item.id === internal?.breakerHolderId);
            const params = new URLSearchParams();
            if (shelf) params.set('shelf', shelf.id);
            if (panel) params.set('panel', panel.id);
            if (endpoint) params.set('endpoint', endpoint.id);

            return {
              path,
              sourceName: source?.name ?? 'Unavailable source',
              targetName: target?.name ?? 'Unavailable destination',
              sourceHref: `/popup/device/${path.source.entityId}${params.size ? `?${params}` : ''}`,
              targetHref: `/popup/device/${path.target.entityId}`,
              sourceTrail: [
                source?.name,
                shelf?.label,
                frame?.label,
                panel?.label,
                endpoint?.label,
              ].filter((name): name is string => Boolean(name)),
            };
          }),
      )
    : [];

  return (
    <DevicePhysicalView
      device={device}
      rack={rack?.kind === 'CONTAINER_RACK' ? rack : null}
      href={href}
      connections={connections}
      focus={focus}
      powerReadable={powerReadable}
      popupMode
    />
  );
}
