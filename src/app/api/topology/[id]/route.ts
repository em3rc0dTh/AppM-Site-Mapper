import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import type {
  ContainerClusterBayVariant,
  ContainerRackVariant,
  RoomSubstructureVariant,
} from '@/modules/topology/domain/entities';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(_request: Request, context: Context) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await context.params;
  const service = new TopologyService(await createTopologyRepository());
  const node = await service.getById(id);

  if (!node) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json({
    node,
    children: await service.listChildren(id),
    deepLink: await service.buildDeepLink(id),
  });
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requirePermission('topology:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== 'object' || !('action' in body)) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const service = new TopologyService(await createTopologyRepository());
  let result;

  if (body.action === 'archive') {
    result = await service.archive(id);
  } else if (body.action === 'restore') {
    result = await service.restore(id);
  } else if (body.action === 'move' && 'parentId' in body && typeof body.parentId === 'string') {
    result = await service.move(id, body.parentId);
  } else if (body.action === 'update') {
    const coordinate =
      'coordinate' in body &&
      body.coordinate &&
      typeof body.coordinate === 'object' &&
      'row' in body.coordinate &&
      'column' in body.coordinate &&
      typeof body.coordinate.row === 'string' &&
      typeof body.coordinate.column === 'number'
        ? { row: body.coordinate.row, column: body.coordinate.column }
        : undefined;
    const dimensions =
      'dimensionsMm' in body &&
      body.dimensionsMm &&
      typeof body.dimensionsMm === 'object' &&
      'width' in body.dimensionsMm &&
      'depth' in body.dimensionsMm &&
      typeof body.dimensionsMm.width === 'number' &&
      typeof body.dimensionsMm.depth === 'number'
        ? {
            width: body.dimensionsMm.width,
            depth: body.dimensionsMm.depth,
            ...('height' in body.dimensionsMm && typeof body.dimensionsMm.height === 'number'
              ? { height: body.dimensionsMm.height }
              : {}),
          }
        : undefined;

    result = await service.update(id, {
      ...('name' in body && typeof body.name === 'string' ? { name: body.name } : {}),
      ...('roomVariant' in body &&
      (body.roomVariant === 'ROOM' || body.roomVariant === 'SUBSTRUCTURE')
        ? { roomVariant: body.roomVariant as RoomSubstructureVariant }
        : {}),
      ...('clusterVariant' in body &&
      (body.clusterVariant === 'CONTAINER_CLUSTER' || body.clusterVariant === 'BAY')
        ? { clusterVariant: body.clusterVariant as ContainerClusterBayVariant }
        : {}),
      ...('containerVariant' in body &&
      (body.containerVariant === 'CONTAINER' || body.containerVariant === 'RACK')
        ? { containerVariant: body.containerVariant as ContainerRackVariant }
        : {}),
      ...(coordinate ? { coordinate } : {}),
      ...('totalU' in body && typeof body.totalU === 'number' ? { totalU: body.totalU } : {}),
      ...(dimensions ? { dimensionsMm: dimensions } : {}),
      ...('serialNumber' in body &&
      (typeof body.serialNumber === 'string' || body.serialNumber === null)
        ? { serialNumber: body.serialNumber }
        : {}),
      ...('category' in body && (typeof body.category === 'string' || body.category === null)
        ? { category: body.category }
        : {}),
    });
  } else {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ node: result.value });
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await requirePermission('topology:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { id } = await context.params;
  const result = await new TopologyService(await createTopologyRepository()).archive(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ node: result.value });
}
