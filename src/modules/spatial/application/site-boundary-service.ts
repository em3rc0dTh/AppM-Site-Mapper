import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { parsePolygon } from '@/modules/spatial/domain/geometry';
import { failure, success } from '@/shared/domain/result';

export async function updateSiteBoundary(repo: TopologyRepository, id: string, input: unknown) {
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
  if (!node || node.kind !== 'SITE') return failure('SITE_NOT_FOUND');
  const trail = await new TopologyService(repo).getTrail(id);
  if (trail.some((ancestor) => ancestor.lifecycle !== 'ACTIVE')) return failure('ENTITY_ARCHIVED');
  if (node.updatedAt !== input.version) return failure('BOUNDARY_CONFLICT');
  if (!repo.replaceIfVersion) return failure('ATOMIC_BOUNDARY_STORAGE_REQUIRED');
  // Area remains a derivation; an old manually entered area must not compete with it.
  const updated = {
    ...node,
    polygon,
    updatedAt: new Date(Math.max(Date.now(), Date.parse(node.updatedAt) + 1)).toISOString(),
  };
  const { totalAreaSqm: _previousArea, ...canonical } = updated;
  void _previousArea;
  if (!(await repo.replaceIfVersion(canonical, input.version))) return failure('BOUNDARY_CONFLICT');
  return success(canonical);
}
