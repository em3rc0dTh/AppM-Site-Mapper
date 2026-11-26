import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { PowerTargetCatalogService } from '@/modules/power/application/power-target-catalog-service';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { createPowerTargetCatalogRepository } from '@/modules/power/infrastructure/power-target-catalog-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import {
  hasOnlyKeys,
  isBoundedString,
  isSafeMutationRequest,
  jsonBodyErrorStatus,
  readBoundedJson,
} from '@/shared/http/request-security';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function catalogService(): Promise<PowerTargetCatalogService> {
  return new PowerTargetCatalogService(
    await createTopologyRepository(),
    await createPowerRepository(),
    await createPowerTargetCatalogRepository(),
  );
}

export async function GET() {
  const auth = await requirePermission('power:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  return NextResponse.json({ targets: await (await catalogService()).list() });
}

export async function POST(request: Request) {
  const auth = await requirePermission('power:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  if (!isSafeMutationRequest(request)) {
    return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  }

  const parsed = await readBoundedJson(request, { maxBytes: 8192, maxDepth: 3, maxNodes: 48 });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: jsonBodyErrorStatus(parsed.error) },
    );
  }
  const body = parsed.value;
  if (
    !isRecord(body) ||
    !hasOnlyKeys(body, [
      'equipmentName',
      'footprint',
      'shelf',
      'module',
      'endpoint',
      'displayLabel',
      'feed',
    ]) ||
    !isBoundedString(body.equipmentName, 120) ||
    !isBoundedString(body.footprint, 64) ||
    (body.shelf !== undefined && !isBoundedString(body.shelf, 64, { allowEmpty: true })) ||
    (body.module !== undefined && !isBoundedString(body.module, 64, { allowEmpty: true })) ||
    (body.endpoint !== undefined && !isBoundedString(body.endpoint, 64, { allowEmpty: true })) ||
    (body.displayLabel !== undefined &&
      !isBoundedString(body.displayLabel, 160, { allowEmpty: true })) ||
    (body.feed !== undefined && body.feed !== 'A' && body.feed !== 'B')
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const optional = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

  const shelf = optional(body.shelf);
  const moduleName = optional(body.module);
  const endpoint = optional(body.endpoint);
  const displayLabel = optional(body.displayLabel);
  const result = await (
    await catalogService()
  ).create({
    equipmentName: body.equipmentName.trim(),
    footprint: body.footprint.trim(),
    ...(shelf ? { shelf } : {}),
    ...(moduleName ? { module: moduleName } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(displayLabel ? { displayLabel } : {}),
    ...(body.feed === 'A' || body.feed === 'B' ? { feed: body.feed } : {}),
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'TARGET_CREATE_FAILED' }, { status: 500 });
  }
  return NextResponse.json({ target: result.value }, { status: 201 });
}
