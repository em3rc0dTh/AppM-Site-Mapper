import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import type {
  ContainerClusterBayVariant,
  ContainerRackVariant,
  RoomSubstructureVariant,
  TopologyKind,
} from '@/modules/topology/domain/entities';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

const topologyKinds = new Set<TopologyKind>([
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
]);

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asKind(value: unknown): TopologyKind | null {
  return typeof value === 'string' && topologyKinds.has(value as TopologyKind)
    ? (value as TopologyKind)
    : null;
}

function roomVariant(value: unknown): RoomSubstructureVariant | undefined {
  return value === 'ROOM' || value === 'SUBSTRUCTURE' ? value : undefined;
}

function clusterVariant(value: unknown): ContainerClusterBayVariant | undefined {
  return value === 'CONTAINER_CLUSTER' || value === 'BAY' ? value : undefined;
}

function containerVariant(value: unknown): ContainerRackVariant | undefined {
  return value === 'CONTAINER' || value === 'RACK' ? value : undefined;
}

export async function GET(request: Request) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const repository = await createTopologyRepository();
  const service = new TopologyService(repository);
  const url = new URL(request.url);
  const parentId = url.searchParams.get('parentId');

  if (!parentId) {
    return NextResponse.json({ nodes: await service.listNetworks() });
  }

  return NextResponse.json({ nodes: await service.listChildren(parentId) });
}

export async function POST(request: Request) {
  const auth = await requirePermission('topology:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body = asObject(await request.json().catch(() => null));
  const kind = asKind(body?.kind);

  if (!body || !kind || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const parentId =
    body.parentId === null || typeof body.parentId === 'string' ? body.parentId : null;

  const coordinateObject = asObject(body.coordinate);
  const coordinate =
    coordinateObject &&
    typeof coordinateObject.row === 'string' &&
    typeof coordinateObject.column === 'number'
      ? { row: coordinateObject.row, column: coordinateObject.column }
      : undefined;

  const parsedRoomVariant = roomVariant(body.roomVariant);
  const parsedClusterVariant = clusterVariant(body.clusterVariant);
  const parsedContainerVariant = containerVariant(body.containerVariant);
  const dimensionsObject = asObject(body.dimensionsMm);
  const dimensionsMm =
    dimensionsObject &&
    typeof dimensionsObject.width === 'number' &&
    typeof dimensionsObject.depth === 'number' &&
    dimensionsObject.width > 0 &&
    dimensionsObject.depth > 0
      ? {
          width: dimensionsObject.width,
          depth: dimensionsObject.depth,
          ...(typeof dimensionsObject.height === 'number' && dimensionsObject.height > 0
            ? { height: dimensionsObject.height }
            : {}),
        }
      : undefined;

  const repository = await createTopologyRepository();

  const result = await new TopologyService(repository).create({
    kind,
    parentId,
    name: body.name,
    ...(parsedRoomVariant ? { roomVariant: parsedRoomVariant } : {}),
    ...(parsedClusterVariant ? { clusterVariant: parsedClusterVariant } : {}),
    ...(parsedContainerVariant ? { containerVariant: parsedContainerVariant } : {}),
    ...(coordinate ? { coordinate } : {}),
    ...(typeof body.totalU === 'number' ? { totalU: body.totalU } : {}),
    ...(dimensionsMm ? { dimensionsMm } : {}),
    ...(typeof body.serialNumber === 'string' ? { serialNumber: body.serialNumber } : {}),
    ...(typeof body.category === 'string' ? { category: body.category } : {}),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ node: result.value }, { status: 201 });
}
