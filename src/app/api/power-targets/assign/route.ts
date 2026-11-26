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

export async function POST(request: Request) {
  const auth = await requirePermission('power:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  if (!isSafeMutationRequest(request)) {
    return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  }

  const parsed = await readBoundedJson(request, { maxBytes: 4096, maxDepth: 3, maxNodes: 32 });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: jsonBodyErrorStatus(parsed.error) },
    );
  }
  const body = parsed.value;
  if (
    !isRecord(body) ||
    !hasOnlyKeys(body, ['sourceAccessPortId', 'targetIdentityKey', 'feed', 'note']) ||
    !isBoundedString(body.sourceAccessPortId, 128) ||
    !isBoundedString(body.targetIdentityKey, 512) ||
    (body.feed !== 'A' && body.feed !== 'B') ||
    (body.note !== undefined && !isBoundedString(body.note, 240, { allowEmpty: true }))
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const service = new PowerTargetCatalogService(
    await createTopologyRepository(),
    await createPowerRepository(),
    await createPowerTargetCatalogRepository(),
  );
  const result = await service.assign({
    sourceAccessPortId: body.sourceAccessPortId,
    targetIdentityKey: body.targetIdentityKey,
    feed: body.feed,
    ...(typeof body.note === 'string' && body.note.trim() ? { note: body.note.trim() } : {}),
  });

  if (!result.ok) {
    const status = result.error === 'TOPOLOGY_CONFLICT' ? 409 : 422;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ assignment: result.value }, { status: 201 });
}
