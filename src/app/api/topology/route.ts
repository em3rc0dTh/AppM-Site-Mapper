import { parsePolygon } from '@/modules/spatial/domain/geometry';
import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import type {
  ContainerClusterBayVariant,
  ContainerRackVariant,
  RoomSubstructureVariant,
  TopologyKind,
} from '@/modules/topology/domain/entities';
import { TopologyService } from '@/modules/topology/application/topology-service';
import {
  parseDeviceType,
  parseEquipmentChildMode,
  parseEquipmentType,
} from '@/modules/topology/domain/type-parsers';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import {
  hasOnlyKeys,
  isBoundedString,
  isSafeMutationRequest,
  jsonBodyErrorStatus,
  readBoundedJson,
} from '@/shared/http/request-security';

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
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const topologyCreateKeys = [
  'kind',
  'parentId',
  'name',
  'polygon',
  'roomVariant',
  'clusterVariant',
  'containerVariant',
  'coordinate',
  'totalU',
  'serialNumber',
  'category',
  'deviceType',
  'equipmentType',
  'childMode',
  'childCapacity',
  'parentSlotIndex',
  'manufacturer',
  'model',
] as const;

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

  if (!isSafeMutationRequest(request)) {
    return NextResponse.json({ error: 'CROSS_SITE_MUTATION_REJECTED' }, { status: 403 });
  }

  const parsed = await readBoundedJson(request, {
    maxBytes: 32_768,
    maxDepth: 8,
    maxNodes: 512,
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: jsonBodyErrorStatus(parsed.error) },
    );
  }

  const body = asObject(parsed.value);
  const kind = asKind(body?.kind);

  if (
    !body ||
    !hasOnlyKeys(body, topologyCreateKeys) ||
    !kind ||
    !isBoundedString(body.name, 120)
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  for (const optionalText of [
    body.serialNumber,
    body.category,
    body.manufacturer,
    body.model,
  ]) {
    if (
      optionalText !== undefined &&
      !isBoundedString(optionalText, 120, { allowEmpty: true })
    ) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
  }

  if (
    (body.parentId !== undefined &&
      body.parentId !== null &&
      typeof body.parentId !== 'string') ||
    (body.deviceType !== undefined && !parseDeviceType(body.deviceType)) ||
    (body.equipmentType !== undefined && !parseEquipmentType(body.equipmentType)) ||
    (body.childMode !== undefined && !parseEquipmentChildMode(body.childMode)) ||
    (body.childCapacity !== undefined && !Number.isInteger(body.childCapacity)) ||
    (body.parentSlotIndex !== undefined && !Number.isInteger(body.parentSlotIndex)) ||
    (body.totalU !== undefined && !Number.isInteger(body.totalU))
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const spatial = ['SITE', 'STRUCTURE', 'ROOM_SUBSTRUCTURE', 'CONTAINER_CLUSTER_BAY'].includes(
    kind,
  );
  const polygon = spatial ? parsePolygon(body.polygon) : null;
  if (spatial && !polygon) return NextResponse.json({ error: 'INVALID_POLYGON' }, { status: 422 });

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

  const repository = await createTopologyRepository();
  const result = await new TopologyService(repository).create({
    kind,
    parentId,
    name: body.name,
    ...(polygon ? { polygon } : {}),
    ...(parsedRoomVariant ? { roomVariant: parsedRoomVariant } : {}),
    ...(parsedClusterVariant ? { clusterVariant: parsedClusterVariant } : {}),
    ...(parsedContainerVariant ? { containerVariant: parsedContainerVariant } : {}),
    ...(coordinate ? { coordinate } : {}),
    ...(typeof body.totalU === 'number' ? { totalU: body.totalU } : {}),
    ...(typeof body.serialNumber === 'string' ? { serialNumber: body.serialNumber } : {}),
    ...(typeof body.category === 'string' ? { category: body.category } : {}),
    ...(parseDeviceType(body.deviceType) ? { deviceType: parseDeviceType(body.deviceType)! } : {}),
    ...(parseEquipmentType(body.equipmentType)
      ? { equipmentType: parseEquipmentType(body.equipmentType)! }
      : {}),
    ...(parseEquipmentChildMode(body.childMode) ? { childMode: parseEquipmentChildMode(body.childMode)! } : {}),
    ...(typeof body.childCapacity === 'number' ? { childCapacity: body.childCapacity } : {}),
    ...(typeof body.parentSlotIndex === 'number'
      ? { parentSlotIndex: body.parentSlotIndex }
      : {}),
    ...(typeof body.manufacturer === 'string' ? { manufacturer: body.manufacturer } : {}),
    ...(typeof body.model === 'string' ? { model: body.model } : {}),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === 'LAYOUT_CONFLICT' ? 409 : 422 },
    );
  }

  return NextResponse.json({ node: result.value }, { status: 201 });
}
