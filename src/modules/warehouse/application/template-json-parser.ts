import type { CreateAssetTemplateInput } from '@/modules/warehouse/application/warehouse-service';
import type {
  AssetTemplateKind,
  BdfbEndpointBlueprint,
  BdfbPhysicalBlueprint,
  WarehouseDeviceType,
} from '@/modules/warehouse/domain/template';

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function parseEndpoint(value: unknown): BdfbEndpointBlueprint | null {
  const endpoint = object(value);
  if (!endpoint || typeof endpoint.label !== 'string') return null;
  const variant =
    endpoint.variant === 'BREAKER' || endpoint.variant === 'HOLDER' ? endpoint.variant : null;
  if (!variant) return null;

  return {
    label: endpoint.label,
    variant,
    ...(number(endpoint.capacity) === undefined ? {} : { capacity: number(endpoint.capacity)! }),
    ...(string(endpoint.rawPointId) ? { rawPointId: string(endpoint.rawPointId)! } : {}),
  };
}

function expandPanelEndpoints(panel: Record<string, unknown>): BdfbEndpointBlueprint[] | null {
  if (Array.isArray(panel.endpoints)) {
    const endpoints = panel.endpoints.map(parseEndpoint);
    return endpoints.every((endpoint): endpoint is BdfbEndpointBlueprint => endpoint !== null)
      ? endpoints
      : null;
  }

  const count = number(panel.endpointCount);
  if (!Number.isInteger(count) || (count ?? 0) < 1 || (count ?? 0) > 256) return null;

  const variant =
    panel.endpointVariant === 'HOLDER'
      ? ('HOLDER' as const)
      : panel.endpointVariant === undefined || panel.endpointVariant === 'BREAKER'
        ? ('BREAKER' as const)
        : null;
  if (!variant) return null;

  const rawPointPrefix = string(panel.rawPointPrefix);
  const endpointLabelPrefix = string(panel.endpointLabelPrefix) ?? string(panel.label) ?? 'EP';

  return Array.from({ length: count! }, (_, index) => ({
    label: `${endpointLabelPrefix}-${String(index + 1).padStart(2, '0')}`,
    variant,
    ...(rawPointPrefix ? { rawPointId: `${rawPointPrefix}${index + 1}` } : {}),
  }));
}

function parseBdfbBlueprint(value: unknown): BdfbPhysicalBlueprint | null {
  const blueprint = object(value);
  if (!blueprint || blueprint.type !== 'BDFB' || !Array.isArray(blueprint.shelves)) return null;

  const shelves = [];
  for (const shelfValue of blueprint.shelves) {
    const shelf = object(shelfValue);
    if (!shelf || typeof shelf.label !== 'string' || !Array.isArray(shelf.frames)) return null;

    const frames = [];
    for (const frameValue of shelf.frames) {
      const frame = object(frameValue);
      if (!frame || typeof frame.label !== 'string' || !Array.isArray(frame.panels)) return null;

      const panels = [];
      for (const panelValue of frame.panels) {
        const panel = object(panelValue);
        if (!panel || typeof panel.label !== 'string') return null;
        const endpoints = expandPanelEndpoints(panel);
        if (!endpoints) return null;
        panels.push({ label: panel.label, endpoints });
      }

      frames.push({
        label: frame.label,
        ...(boolean(frame.physicalFrameVisible) === undefined
          ? {}
          : { physicalFrameVisible: boolean(frame.physicalFrameVisible)! }),
        panels,
      });
    }

    shelves.push({ label: shelf.label, frames });
  }

  return { type: 'BDFB', shelves };
}

export function parseAssetTemplateJson(value: unknown): CreateAssetTemplateInput | null {
  const body = object(value);
  if (!body || typeof body.name !== 'string') return null;

  const kind =
    body.kind === 'DEVICE' || body.kind === 'EQUIPMENT' ? (body.kind as AssetTemplateKind) : null;
  if (!kind) return null;

  const dimensions = object(body.dimensionsMm);
  const widthMm = number(body.widthMm) ?? (dimensions ? number(dimensions.width) : undefined);
  const depthMm = number(body.depthMm) ?? (dimensions ? number(dimensions.depth) : undefined);

  const deviceType = body.deviceType === 'BDFB' ? ('BDFB' as WarehouseDeviceType) : undefined;
  const physicalBlueprint =
    body.physicalBlueprint === undefined ? undefined : parseBdfbBlueprint(body.physicalBlueprint);
  if (body.physicalBlueprint !== undefined && !physicalBlueprint) return null;

  return {
    kind,
    name: body.name,
    ...(string(body.manufacturer) !== undefined
      ? { manufacturer: string(body.manufacturer)! }
      : {}),
    ...(string(body.model) !== undefined ? { model: string(body.model)! } : {}),
    ...(string(body.category) !== undefined ? { category: string(body.category)! } : {}),
    ...(number(body.sizeU) !== undefined ? { sizeU: number(body.sizeU)! } : {}),
    ...(widthMm !== undefined ? { widthMm } : {}),
    ...(depthMm !== undefined ? { depthMm } : {}),
    ...(string(body.notes) !== undefined ? { notes: string(body.notes)! } : {}),
    ...(deviceType ? { deviceType } : {}),
    ...(physicalBlueprint ? { physicalBlueprint } : {}),
  };
}
