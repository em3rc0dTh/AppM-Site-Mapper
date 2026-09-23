import type { PowerEndpoint } from '@/modules/power/domain/entities';
import type {
  BreakerHolder,
  DeviceNode,
  Frame,
  Panel,
  Shelf,
  TopologyNode,
} from '@/modules/topology/domain/entities';

export type EndpointValidationError =
  | 'OWNER_NOT_FOUND'
  | 'OWNER_ARCHIVED'
  | 'OWNER_NOT_POWER_CAPABLE'
  | 'INTERNAL_ENDPOINT_REQUIRES_DEVICE'
  | 'BDFB_NOT_CONFIGURED'
  | 'SHELF_NOT_FOUND'
  | 'FRAME_NOT_FOUND'
  | 'PANEL_NOT_FOUND'
  | 'BREAKER_HOLDER_NOT_FOUND'
  | 'INVALID_INTERNAL_PATH';

export interface ResolvedPowerEndpoint {
  readonly owner: Extract<TopologyNode, { kind: 'DEVICE' | 'EQUIPMENT' }>;
  readonly shelf?: Shelf;
  readonly frame?: Frame;
  readonly panel?: Panel;
  readonly breakerHolder?: BreakerHolder;
}

function hasAnyInternalPart(endpoint: PowerEndpoint): boolean {
  if (!endpoint.internal) {
    return false;
  }

  return Object.values(endpoint.internal).some(Boolean);
}

export function resolvePowerEndpoint(
  owner: TopologyNode | null,
  endpoint: PowerEndpoint,
): { ok: true; value: ResolvedPowerEndpoint } | { ok: false; error: EndpointValidationError } {
  if (!owner || owner.id !== endpoint.entityId) {
    return { ok: false, error: 'OWNER_NOT_FOUND' };
  }

  if (owner.lifecycle !== 'ACTIVE') {
    return { ok: false, error: 'OWNER_ARCHIVED' };
  }

  if (owner.kind !== 'DEVICE' && owner.kind !== 'EQUIPMENT') {
    return { ok: false, error: 'OWNER_NOT_POWER_CAPABLE' };
  }

  if (!hasAnyInternalPart(endpoint)) {
    return { ok: true, value: { owner } };
  }

  if (owner.kind !== 'DEVICE') {
    return { ok: false, error: 'INTERNAL_ENDPOINT_REQUIRES_DEVICE' };
  }

  return resolveDeviceInternalEndpoint(owner, endpoint);
}

function resolveDeviceInternalEndpoint(
  device: DeviceNode,
  endpoint: PowerEndpoint,
): { ok: true; value: ResolvedPowerEndpoint } | { ok: false; error: EndpointValidationError } {
  const internal = endpoint.internal;

  if (!internal || !internal.shelfId) {
    return { ok: false, error: 'INVALID_INTERNAL_PATH' };
  }

  if (!device.bdfb) {
    return { ok: false, error: 'BDFB_NOT_CONFIGURED' };
  }

  const shelf = device.bdfb.shelves.find((candidate) => candidate.id === internal.shelfId);

  if (!shelf) {
    return { ok: false, error: 'SHELF_NOT_FOUND' };
  }

  if (!internal.frameId) {
    return internal.panelId || internal.breakerHolderId
      ? { ok: false, error: 'INVALID_INTERNAL_PATH' }
      : { ok: true, value: { owner: device, shelf } };
  }

  const frame = shelf.frames.find((candidate) => candidate.id === internal.frameId);

  if (!frame) {
    return { ok: false, error: 'FRAME_NOT_FOUND' };
  }

  if (!internal.panelId) {
    return internal.breakerHolderId
      ? { ok: false, error: 'INVALID_INTERNAL_PATH' }
      : { ok: true, value: { owner: device, shelf, frame } };
  }

  const panel = frame.panels.find((candidate) => candidate.id === internal.panelId);

  if (!panel) {
    return { ok: false, error: 'PANEL_NOT_FOUND' };
  }

  if (!internal.breakerHolderId) {
    return { ok: true, value: { owner: device, shelf, frame, panel } };
  }

  const breakerHolder = panel.endpoints.find(
    (candidate) => candidate.id === internal.breakerHolderId,
  );

  if (!breakerHolder) {
    return { ok: false, error: 'BREAKER_HOLDER_NOT_FOUND' };
  }

  return {
    ok: true,
    value: { owner: device, shelf, frame, panel, breakerHolder },
  };
}

export function powerEndpointKey(endpoint: PowerEndpoint): string {
  return JSON.stringify({
    entityId: endpoint.entityId,
    shelfId: endpoint.internal?.shelfId ?? null,
    frameId: endpoint.internal?.frameId ?? null,
    panelId: endpoint.internal?.panelId ?? null,
    breakerHolderId: endpoint.internal?.breakerHolderId ?? null,
  });
}
