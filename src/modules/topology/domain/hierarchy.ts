import type { TopologyKind, TopologyNode } from '@/modules/topology/domain/entities';

export const parentKind: Readonly<Record<TopologyKind, TopologyKind | null>> = {
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

const childKinds: Readonly<Partial<Record<TopologyKind, readonly TopologyKind[]>>> = {
  NETWORK: ['SITE'],
  SITE: ['STRUCTURE'],
  STRUCTURE: ['LEVEL'],
  LEVEL: ['ROOM_SUBSTRUCTURE'],
  ROOM_SUBSTRUCTURE: ['CONTAINER_CLUSTER_BAY'],
  CONTAINER_CLUSTER_BAY: ['POSITION'],
  POSITION: ['CONTAINER_RACK'],
  CONTAINER_RACK: ['DEVICE', 'EQUIPMENT'],
};

export const topologySlug: Readonly<Record<TopologyKind, string>> = {
  NETWORK: 'network',
  SITE: 'site',
  STRUCTURE: 'structure',
  LEVEL: 'level',
  ROOM_SUBSTRUCTURE: 'room',
  CONTAINER_CLUSTER_BAY: 'cluster',
  POSITION: 'position',
  CONTAINER_RACK: 'rack',
  DEVICE: 'device',
  EQUIPMENT: 'equipment',
};

export function allowedChildKinds(kind: TopologyKind): readonly TopologyKind[] {
  return childKinds[kind] ?? [];
}

export function isAllowedParent(childKind: TopologyKind, parent: TopologyNode | null): boolean {
  const expected = parentKind[childKind];
  return expected === null ? parent === null : parent?.kind === expected;
}
