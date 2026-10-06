import type { CreateAssetTemplateInput } from '@/modules/warehouse/application/warehouse-service';
import type {
  AssetTemplateKind,
  BdfbEndpointBlueprint,
  BdfbFrameBlueprint,
  BdfbPanelBlueprint,
  BdfbPhysicalBlueprint,
  BdfbShelfBlueprint,
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

function parseBreakerEndpoint(value: unknown): BdfbEndpointBlueprint | null {
  const endpoint = object(value);
  if (!endpoint || typeof endpoint.label !== 'string') return null;
  if (endpoint.variant !== undefined && endpoint.variant !== 'BREAKER') return null;

  return {
    label: endpoint.label,
    ...(number(endpoint.capacity) === undefined ? {} : { capacity: number(endpoint.capacity)! }),
    ...(string(endpoint.rawPointId) ? { rawPointId: string(endpoint.rawPointId)! } : {}),
  };
}

function expandPanelEndpoints(panel: Record<string, unknown>): (BdfbEndpointBlueprint | null)[] | null {
  if (Array.isArray(panel.endpoints)) {
    const endpoints: (BdfbEndpointBlueprint | null)[] = [];
    for (const value of panel.endpoints) {
      if (value === null) {
        endpoints.push(null);
        continue;
      }
      const endpoint = parseBreakerEndpoint(value);
      if (!endpoint) return null;
      endpoints.push(endpoint);
    }
    return endpoints;
  }

  const count = number(panel.endpointCount);
  if (!Number.isInteger(count) || (count ?? 0) < 1 || (count ?? 0) > 256) return null;
  if (panel.endpointVariant !== undefined && panel.endpointVariant !== 'BREAKER') return null;

  const rawPointPrefix = string(panel.rawPointPrefix);
  const endpointLabelPrefix = string(panel.endpointLabelPrefix) ?? string(panel.label) ?? 'EP';

  return Array.from({ length: count! }, (_, index) => ({
    label: `${endpointLabelPrefix}-${String(index + 1).padStart(2, '0')}`,
    ...(rawPointPrefix ? { rawPointId: `${rawPointPrefix}${index + 1}` } : {}),
  }));
}

function parsePanel(value: unknown): BdfbPanelBlueprint | null {
  const panel = object(value);
  if (!panel || typeof panel.label !== 'string') return null;
  const endpoints = expandPanelEndpoints(panel);
  return endpoints ? { label: panel.label, endpoints } : null;
}

function parseFrame(value: unknown): BdfbFrameBlueprint | null {
  const frame = object(value);
  if (!frame || typeof frame.label !== 'string' || !Array.isArray(frame.panels)) return null;
  const panels = frame.panels.map(parsePanel);
  if (!panels.every((panel): panel is BdfbPanelBlueprint => panel !== null)) return null;
  return {
    label: frame.label,
    ...(boolean(frame.physicalFrameVisible) === undefined
      ? {}
      : { physicalFrameVisible: boolean(frame.physicalFrameVisible)! }),
    panels,
  };
}

function parseShelf(value: unknown): BdfbShelfBlueprint | null {
  const shelf = object(value);
  if (!shelf || typeof shelf.label !== 'string') return null;
  if (shelf.frames !== undefined && !Array.isArray(shelf.frames)) return null;
  if (shelf.panels !== undefined && !Array.isArray(shelf.panels)) return null;

  const frames = (shelf.frames ?? []).map(parseFrame);
  const panels = (shelf.panels ?? []).map(parsePanel);
  if (!frames.every((frame): frame is BdfbFrameBlueprint => frame !== null)) return null;
  if (!panels.every((panel): panel is BdfbPanelBlueprint => panel !== null)) return null;
  if (frames.length === 0 && panels.length === 0) return null;

  return {
    label: shelf.label,
    ...(frames.length ? { frames } : {}),
    ...(panels.length ? { panels } : {}),
  };
}

function parseBdfbBlueprint(value: unknown): BdfbPhysicalBlueprint | null {
  const blueprint = object(value);
  if (!blueprint || blueprint.type !== 'BDFB') return null;
  if (blueprint.shelves !== undefined && !Array.isArray(blueprint.shelves)) return null;
  if (blueprint.frames !== undefined && !Array.isArray(blueprint.frames)) return null;
  if (blueprint.panels !== undefined && !Array.isArray(blueprint.panels)) return null;

  const shelves = (blueprint.shelves ?? []).map(parseShelf);
  const frames = (blueprint.frames ?? []).map(parseFrame);
  const panels = (blueprint.panels ?? []).map(parsePanel);
  if (!shelves.every((shelf): shelf is BdfbShelfBlueprint => shelf !== null)) return null;
  if (!frames.every((frame): frame is BdfbFrameBlueprint => frame !== null)) return null;
  if (!panels.every((panel): panel is BdfbPanelBlueprint => panel !== null)) return null;
  if (shelves.length === 0 && frames.length === 0 && panels.length === 0) return null;

  return {
    type: 'BDFB',
    ...(shelves.length ? { shelves } : {}),
    ...(frames.length ? { frames } : {}),
    ...(panels.length ? { panels } : {}),
  };
}

export function parseAssetTemplateJson(value: unknown): CreateAssetTemplateInput | null {
  const body = object(value);
  if (!body || typeof body.name !== 'string') return null;

  const kind = body.kind === 'EQUIPMENT' ? (body.kind as AssetTemplateKind) : null;
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
