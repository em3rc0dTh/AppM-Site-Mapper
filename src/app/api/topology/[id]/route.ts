import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { TopologyService } from '@/modules/topology/application/topology-service';
import {
  parseEquipmentChildMode,
  parseEquipmentType,
} from '@/modules/topology/domain/type-parsers';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import {
  hasOnlyKeys,
  isSafeMutationRequest,
  jsonBodyErrorStatus,
  readBoundedJson,
} from '@/shared/http/request-security';

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

  if (!isSafeMutationRequest(request)) {
    return NextResponse.json({ error: 'CROSS_SITE_MUTATION_REJECTED' }, { status: 403 });
  }

  const { id } = await context.params;
  const parsed = await readBoundedJson(request, {
    maxBytes: 8_192,
    maxDepth: 4,
    maxNodes: 64,
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: jsonBodyErrorStatus(parsed.error) },
    );
  }

  if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const body = parsed.value as Record<string, unknown>;
  if (typeof body.action !== 'string') {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const service = new TopologyService(await createTopologyRepository());
  let result;

  if (body.action === 'archive' || body.action === 'restore') {
    if (!hasOnlyKeys(body, ['action'])) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    result = body.action === 'archive' ? await service.archive(id) : await service.restore(id);
  } else if (body.action === 'move') {
    if (
      !hasOnlyKeys(body, ['action', 'parentId', 'slotIndex']) ||
      typeof body.parentId !== 'string' ||
      body.parentId.length < 1 ||
      body.parentId.length > 160 ||
      (body.slotIndex !== undefined && !Number.isInteger(body.slotIndex))
    ) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    result = await service.move(
      id,
      body.parentId,
      typeof body.slotIndex === 'number' ? body.slotIndex : undefined,
    );
  } else if (body.action === 'configure-equipment') {
    if (
      !hasOnlyKeys(body, [
        'action',
        'equipmentType',
        'childMode',
        'childCapacity',
        'presentation',
      ]) ||
      (body.equipmentType !== undefined && !parseEquipmentType(body.equipmentType)) ||
      (body.childMode !== undefined && !parseEquipmentChildMode(body.childMode)) ||
      (body.childCapacity !== undefined && !Number.isInteger(body.childCapacity)) ||
      (body.presentation !== undefined &&
        (!body.presentation ||
          typeof body.presentation !== 'object' ||
          Array.isArray(body.presentation) ||
          !hasOnlyKeys(body.presentation as Record<string, unknown>, [
            'direction',
            'maxPerLine',
            'childrenVisibility',
          ]) ||
          !['ROW', 'COLUMN'].includes(
            (body.presentation as Record<string, unknown>).direction as string,
          ) ||
          !['AUTO', 'INLINE', 'SUMMARY'].includes(
            (body.presentation as Record<string, unknown>).childrenVisibility as string,
          ) ||
          !(
            (body.presentation as Record<string, unknown>).maxPerLine === null ||
            (Number.isInteger((body.presentation as Record<string, unknown>).maxPerLine) &&
              ((body.presentation as Record<string, unknown>).maxPerLine as number) >= 1 &&
              ((body.presentation as Record<string, unknown>).maxPerLine as number) <= 256)
          )))
    ) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    result = await service.configureEquipment(id, {
      ...(parseEquipmentType(body.equipmentType)
        ? { equipmentType: parseEquipmentType(body.equipmentType)! }
        : {}),
      ...(parseEquipmentChildMode(body.childMode)
        ? { childMode: parseEquipmentChildMode(body.childMode)! }
        : {}),
      ...(typeof body.childCapacity === 'number' ? { childCapacity: body.childCapacity } : {}),
      ...(body.presentation
        ? {
            presentation: body.presentation as {
              direction: 'ROW' | 'COLUMN';
              maxPerLine: number | null;
              childrenVisibility: 'AUTO' | 'INLINE' | 'SUMMARY';
            },
          }
        : {}),
    });
  } else {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  if (!result.ok) {
    const status =
      result.error === 'NOT_FOUND'
        ? 404
        : result.error === 'LAYOUT_CONFLICT' ||
            result.error === 'SLOT_OCCUPIED' ||
            result.error === 'POSITION_OCCUPIED'
          ? 409
          : 422;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ node: result.value });
}
