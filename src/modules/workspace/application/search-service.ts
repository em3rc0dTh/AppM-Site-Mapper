import { BdfbProjectionService } from '@/modules/power/application/bdfb-projection-service';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { TopologyKind } from '@/modules/topology/domain/entities';

export interface SearchResult {
  id: string;
  name: string;
  kind: string;
  href: string;
  breadcrumb: string;
}

const kinds: TopologyKind[] = [
  'NETWORK',
  'SITE',
  'STRUCTURE',
  'LEVEL',
  'ROOM_SUBSTRUCTURE',
  'CONTAINER_CLUSTER_BAY',
  'POSITION',
  'CONTAINER_RACK',
  'DEVICE',
  'EQUIPMENT',
];

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function searchMatches(value: string, query: string): boolean {
  const normalizedValue = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;
  if (normalizedValue.includes(normalizedQuery)) return true;

  // Also match compact forms so "WS-LUR", "WS LUR" and "WSLUR" are equivalent.
  const compactValue = normalizedValue.replace(/\s+/g, '');
  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  return compactValue.includes(compactQuery);
}

export async function searchTopology(
  repository: TopologyRepository,
  query: string,
): Promise<SearchResult[]> {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];

  const service = new TopologyService(repository);
  const bdfbProjection = new BdfbProjectionService(repository);
  const nodes = (await Promise.all(kinds.map((kind) => repository.listByKind(kind))))
    .flat()
    .filter((node) => node.lifecycle === 'ACTIVE');

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const results: SearchResult[] = [];
  for (const node of nodes) {
    const trail = await service.getTrail(node.id);
    if (trail.some((item) => item.lifecycle !== 'ACTIVE')) continue;
    const breadcrumb = trail.map((item) => item.name).join(' / ');
    const href =
      node.kind === 'CONTAINER_RACK'
        ? `/rack/${node.id}/focus`
        : node.kind === 'DEVICE' && node.deviceType === 'BDFB'
          ? await service.buildDeepLink(node.id)
          : node.kind === 'DEVICE' || node.kind === 'EQUIPMENT'
            ? `/device/${node.id}`
            : await service.buildDeepLink(node.id);

    if (searchMatches(`${node.name} ${node.id}`, normalized)) {
      results.push({ id: node.id, name: node.name, kind: node.kind, href, breadcrumb });
    }

    if (node.kind === 'EQUIPMENT' && node.equipmentType === 'CIRCUIT_BREAKER') {
      for (const alias of node.aliases ?? []) {
        const target = alias.trim();
        if (!target || !searchMatches(target, normalized)) continue;
        const panel = node.parentEquipmentId ? byId.get(node.parentEquipmentId) : null;
        const device = byId.get(node.deviceId);
        results.push({
          id: `power-target:${node.id}:${target}`,
          name: target,
          kind: 'POWER_TARGET',
          href: `/power?breaker=${encodeURIComponent(node.id)}`,
          breadcrumb: `${device?.name ?? 'Power source'} / ${panel?.name ?? 'Panel'} / ${node.name} → declared target`,
        });
      }
    }

    if (node.kind !== 'DEVICE' || node.deviceType !== 'BDFB') continue;
    const presentation = await bdfbProjection.get(node.id);
    if (!presentation) continue;
    const deviceHref = await service.buildDeepLink(node.id);

    for (const shelf of presentation.shelves) {
      for (const frame of shelf.frames) {
        for (const panel of frame.panels) {
          const base = `${deviceHref}?panel=${encodeURIComponent(panel.id)}`;
          if (searchMatches(`${panel.label} ${panel.id}`, normalized)) {
            results.push({
              id: panel.id,
              name: panel.label,
              kind: 'PANEL',
              href: base,
              breadcrumb: `${breadcrumb} / ${shelf.label} / ${frame.label}`,
            });
          }

          for (const breaker of panel.positions) {
            if (
              breaker &&
              searchMatches(`${breaker.label} ${breaker.id}`, normalized)
            ) {
              results.push({
                id: breaker.id,
                name: breaker.label,
                kind: 'BREAKER',
                href: `${base}&breaker=${encodeURIComponent(breaker.id)}`,
                breadcrumb: `${breadcrumb} / ${panel.label}`,
              });
            }
          }
        }
      }
    }
  }

  return results
    .sort(
      (left, right) =>
        Number(normalizeSearchText(right.name) === normalized) -
          Number(normalizeSearchText(left.name) === normalized) ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 50);
}
