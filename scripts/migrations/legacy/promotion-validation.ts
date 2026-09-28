import type { CanonicalKind, CanonicalNode } from './model.ts';

const expectedParentKind: Readonly<Record<CanonicalKind, CanonicalKind | null>> = {
  NETWORK: null,
  SITE: 'NETWORK',
  STRUCTURE: 'SITE',
  LEVEL: 'STRUCTURE',
  ROOM_SUBSTRUCTURE: 'LEVEL',
  CONTAINER_CLUSTER_BAY: 'ROOM_SUBSTRUCTURE',
  POSITION: 'CONTAINER_CLUSTER_BAY',
  CONTAINER_RACK: 'POSITION',
  DEVICE: 'CONTAINER_RACK',
  EQUIPMENT: 'CONTAINER_RACK',
};

export interface PromotionValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly countsByKind: Readonly<Record<string, number>>;
}

export function validatePromotionCandidate(
  nodes: readonly CanonicalNode[],
): PromotionValidation {
  const errors: string[] = [];
  const byId = new Map<string, CanonicalNode>();
  const countsByKind: Record<string, number> = {};

  for (const node of nodes) {
    countsByKind[node.kind] = (countsByKind[node.kind] ?? 0) + 1;

    if (!node.id?.trim()) {
      errors.push('NODE_WITHOUT_ID');
      continue;
    }

    if (byId.has(node.id)) {
      errors.push(`DUPLICATE_ID:${node.id}`);
      continue;
    }

    byId.set(node.id, node);
  }

  const networks = nodes.filter((node) => node.kind === 'NETWORK');
  if (networks.length !== 1) {
    errors.push(`NETWORK_COUNT:${networks.length}`);
  }

  for (const node of nodes) {
    const expected = expectedParentKind[node.kind];

    if (expected === null) {
      if (node.parentId !== null) {
        errors.push(`NETWORK_HAS_PARENT:${node.id}`);
      }
      continue;
    }

    if (!node.parentId) {
      errors.push(`MISSING_PARENT:${node.id}`);
      continue;
    }

    const parent = byId.get(node.parentId);
    if (!parent) {
      errors.push(`ORPHAN:${node.id}:${node.parentId}`);
      continue;
    }

    if (parent.kind !== expected) {
      errors.push(`INVALID_PARENT_KIND:${node.id}:${parent.kind}:${expected}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    countsByKind,
  };
}
