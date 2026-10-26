import type { TopologyNode } from '@/modules/topology/domain/entities';

export function versionFilter(node: TopologyNode) {
  return { id: node.id, ...(node.revision === undefined
    ? { revision: { $exists: false }, updatedAt: node.updatedAt }
    : { revision: node.revision }) };
}

export function nextTopologyVersion(node: TopologyNode, previous?: TopologyNode): TopologyNode {
  const revision = previous?.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('INVALID_TOPOLOGY_REVISION');
  }
  return { ...node, revision: revision + 1, updatedAt: new Date(Math.max(
    Date.parse(node.updatedAt), previous ? Date.parse(previous.updatedAt) + 1 : 0,
  )).toISOString() };
}

export function sameTopologyVersion(left: TopologyNode, right: TopologyNode): boolean {
  return left.revision === right.revision && (left.revision !== undefined || left.updatedAt === right.updatedAt);
}
