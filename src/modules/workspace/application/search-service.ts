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

export async function searchTopology(
  repository: TopologyRepository,
  query: string,
): Promise<SearchResult[]> {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];

  const service = new TopologyService(repository);
  const bdfbProjection = new BdfbProjectionService(repository);
  const nodes = (await Promise.all(kinds.map((kind) => repository.listByKind(kind))))
    .flat()
    .filter((node) => node.lifecycle === 'ACTIVE');

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

    if (`${node.name} ${node.id}`.toLocaleLowerCase().includes(normalized)) {
      results.push({ id: node.id, name: node.name, kind: node.kind, href, breadcrumb });
    }

    if (node.kind !== 'DEVICE' || node.deviceType !== 'BDFB') continue;
    const presentation = await bdfbProjection.get(node.id);
    if (!presentation) continue;
    const deviceHref = await service.buildDeepLink(node.id);

    for (const shelf of presentation.shelves) {
      for (const frame of shelf.frames) {
        for (const panel of frame.panels) {
          const base = `${deviceHref}?panel=${encodeURIComponent(panel.id)}`;
          if (`${panel.label} ${panel.id}`.toLocaleLowerCase().includes(normalized)) {
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
              `${breaker.label} ${breaker.id}`.toLocaleLowerCase().includes(normalized)
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
        Number(right.name.toLowerCase() === normalized) -
          Number(left.name.toLowerCase() === normalized) ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 50);
}
