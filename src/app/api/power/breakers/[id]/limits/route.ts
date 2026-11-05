import { NextResponse } from 'next/server';
import { BreakerLimitService } from '@/modules/power/application/breaker-limit-service';
import { parseBreakerProtectionInput } from '@/modules/power/domain/breaker-protection';
import { requirePermission } from '@/modules/identity/application/current-session';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import {
  hasOnlyKeys,
  isSafeMutationRequest,
  jsonBodyErrorStatus,
  readBoundedJson,
} from '@/shared/http/request-security';

type Context = { params: Promise<{ id: string }> };
function status(error: string): number {
  if (error === 'BREAKER_NOT_FOUND') return 404;
  if (
    error === 'BREAKER_STALE_WRITE' ||
    error === 'BREAKER_POLICY_STALE_WRITE' ||
    error === 'BREAKER_POLICY_AMBIGUOUS' ||
    error === 'BREAKER_CURRENT_BINDING_REQUIRED' ||
    error === 'BREAKER_POLICY_SOURCE_MISMATCH' ||
    error === 'BREAKER_TOPOLOGY_CONFLICT' ||
    error === 'VERIFIED_RATING_DOWNGRADE_FORBIDDEN' ||
    error === 'EXISTING_RATING_REQUIRES_RECONCILIATION' ||
    error === 'BREAKER_EXISTING_RATING_INVALID'
  )
    return 409;
  if (
    error.startsWith('INVALID_BREAKER_') ||
    error === 'PROVISIONAL_RATING_CANNOT_BE_VERIFIED' ||
    error === 'VERIFIED_RATING_REQUIRES_EVIDENCE' ||
    error === 'VERIFIED_RATING_REQUIRES_CONFIRMATION'
  )
    return 422;
  return 500;
}
function publicCode(error: string): string {
  return status(error) === 500 ? 'BREAKER_LIMIT_INTERNAL_ERROR' : error;
}
function unavailable() {
  return NextResponse.json({ error: 'BREAKER_LIMITS_REQUIRE_PERSISTENT_STORAGE' }, { status: 503 });
}
export async function GET(_request: Request, context: Context) {
  const auth = await requirePermission('power:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  if (getPersistenceMode() !== 'mongodb') return unavailable();
  const canWrite = await requirePermission('power:write');
  try {
    const { id } = await context.params;
    const service = new BreakerLimitService(await getMongoDatabase());
    return NextResponse.json(
      { ...(await service.get(id)), canEdit: canWrite.ok },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'BREAKER_LIMIT_READ_FAILED';
    return NextResponse.json({ error: publicCode(code) }, { status: status(code) });
  }
}
export async function PATCH(request: Request, context: Context) {
  const auth = await requirePermission('power:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  if (!isSafeMutationRequest(request))
    return NextResponse.json({ error: 'CROSS_SITE_MUTATION_REJECTED' }, { status: 403 });
  if (getPersistenceMode() !== 'mongodb') return unavailable();
  const body = await readBoundedJson(request, { maxBytes: 4096, maxDepth: 4, maxNodes: 32 });
  if (!body.ok)
    return NextResponse.json({ error: body.error }, { status: jsonBodyErrorStatus(body.error) });
  if (
    !body.value ||
    typeof body.value !== 'object' ||
    Array.isArray(body.value) ||
    !hasOnlyKeys(body.value as Record<string, unknown>, [
      'ratedCurrentA',
      'assertAboveA',
      'clearBelowA',
      'provenance',
      'expectedRevision',
      'verificationConfirmed',
    ])
  ) {
    return NextResponse.json({ error: 'INVALID_BREAKER_LIMITS' }, { status: 400 });
  }
  try {
    const input = parseBreakerProtectionInput(body.value);
    const { id } = await context.params;
    const result = await new BreakerLimitService(await getMongoDatabase()).update(
      id,
      input,
      auth.value.id,
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'BREAKER_LIMIT_WRITE_FAILED';
    return NextResponse.json({ error: publicCode(code) }, { status: status(code) });
  }
}
