import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { snapshotTemplate } from '@/modules/warehouse/domain/template';
import { WarehouseService } from '@/modules/warehouse/application/warehouse-service';
import { createWarehouseRepository } from '@/modules/warehouse/infrastructure/warehouse-repository-factory';

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export async function POST(request: Request) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const body = object(await request.json().catch(() => null));
  if (
    !body ||
    typeof body.templateId !== 'string' ||
    typeof body.rackId !== 'string' ||
    typeof body.name !== 'string'
  )
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const warehouse = new WarehouseService(await createWarehouseRepository());
  const template = await warehouse.getById(body.templateId);
  if (!template)
    return NextResponse.json({ error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });

  const topologyRepository = await createTopologyRepository();
  const topology = new TopologyService(topologyRepository);
  const rack = await topology.getById(body.rackId);
  if (
    !rack ||
    rack.kind !== 'CONTAINER_RACK' ||
    rack.variant !== 'RACK' ||
    rack.lifecycle !== 'ACTIVE'
  )
    return NextResponse.json({ error: 'RACK_NOT_FOUND' }, { status: 404 });

  const result = await topology.create({
    kind: template.kind,
    parentId: rack.id,
    name: body.name,
    ...(typeof body.serialNumber === 'string' ? { serialNumber: body.serialNumber } : {}),
    ...(typeof body.category === 'string' && body.category.trim()
      ? { category: body.category }
      : template.category
        ? { category: template.category }
        : {}),
    template: snapshotTemplate(template),
  });

  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json(
    {
      node: result.value,
      recommendedMountSizeU: template.sizeU ?? null,
      state: 'UNMOUNTED',
    },
    { status: 201 },
  );
}
