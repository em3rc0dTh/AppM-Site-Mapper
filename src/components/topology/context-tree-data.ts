import type { ContextTreeEntry } from '@/components/topology/context-tree';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { TopologyNode } from '@/modules/topology/domain/entities';

export async function toContextEntry(
  service: TopologyService,
  node: TopologyNode,
): Promise<ContextTreeEntry> {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    href: await service.buildDeepLink(node.id),
    lifecycle: node.lifecycle,
  };
}

export async function buildContextTree(
  repository: TopologyRepository,
  service: TopologyService,
  root: TopologyNode,
  visited: ReadonlySet<string> = new Set(),
): Promise<ContextTreeEntry> {
  if (visited.has(root.id)) {
    throw new Error(`Topology cycle detected while rendering hierarchy at ${root.id}.`);
  }

  const nextVisited = new Set(visited);
  nextVisited.add(root.id);
  const children = await repository.listChildren(root.id);

  return {
    ...(await toContextEntry(service, root)),
    children: await Promise.all(
      children.map((child) => buildContextTree(repository, service, child, nextVisited)),
    ),
  };
}

export async function buildTrailEntries(
  service: TopologyService,
  trail: readonly TopologyNode[],
): Promise<ContextTreeEntry[]> {
  return Promise.all(trail.map((node) => toContextEntry(service, node)));
}
