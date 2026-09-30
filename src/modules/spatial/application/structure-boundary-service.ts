import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { parsePolygon, polygonInsidePolygon } from '@/modules/spatial/domain/geometry';
import { failure, success } from '@/shared/domain/result';

export async function updateStructureBoundary(
  repo: TopologyRepository,
  id: string,
  input: unknown,
) {
  if (
    !input ||
    typeof input !== 'object' ||
    !('polygon' in input) ||
    !('version' in input) ||
    typeof input.version !== 'string'
  )
    return failure('INVALID_REQUEST');

  const polygon = parsePolygon(input.polygon);
  if (!polygon) return failure('INVALID_POLYGON');

  const node = await repo.getById(id);
  if (!node || node.kind !== 'STRUCTURE') return failure('STRUCTURE_NOT_FOUND');

  const parent = node.parentId ? await repo.getById(node.parentId) : null;
  if (!parent || parent.kind !== 'SITE' || !parent.polygon)
    return failure('SITE_BOUNDARY_REQUIRED');
  if (!polygonInsidePolygon(polygon, parent.polygon)) return failure('BOUNDARY_OUTSIDE_SITE');

  const trail = await new TopologyService(repo).getTrail(id);
  if (trail.some((ancestor) => ancestor.lifecycle !== 'ACTIVE'))
    return failure('ENTITY_ARCHIVED');
  if (node.updatedAt !== input.version) return failure('BOUNDARY_CONFLICT');
  if (!repo.replaceIfVersion) return failure('ATOMIC_BOUNDARY_STORAGE_REQUIRED');

  const updated = {
    ...node,
    polygon,
    updatedAt: new Date(Math.max(Date.now(), Date.parse(node.updatedAt) + 1)).toISOString(),
  };

  if (!(await repo.replaceIfVersion(updated, input.version))) return failure('BOUNDARY_CONFLICT');
  return success(updated);
}
