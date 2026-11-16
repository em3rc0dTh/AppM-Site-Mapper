import { createHash } from 'node:crypto';
import { requirePermission } from '@/modules/identity/application/current-session';
import { verifyPassword } from '@/modules/identity/domain/password';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';
import { IndustrialCredentialService } from '@/modules/industrial/application/credential-service';
import { createIndustrialCredentialRepository } from '@/modules/industrial/infrastructure/credential-repository';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import {
  hasOnlyKeys,
  isBoundedString,
  isSafeMutationRequest,
  jsonBodyErrorStatus,
  readBoundedJson,
} from '@/shared/http/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function credentialService() {
  return new IndustrialCredentialService(
    await createIndustrialCredentialRepository(),
    await createTopologyRepository(),
  );
}

function status(error: string): number {
  if (error === 'EQUIPMENT_NOT_FOUND' || error === 'CREDENTIAL_NOT_FOUND') return 404;
  if (error === 'CREDENTIAL_CONFLICT') return 409;
  if (error === 'CREDENTIAL_KEY_NOT_CONFIGURED') return 503;
  return 422;
}

export async function GET(request: Request) {
  const auth = await requirePermission('credentials:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const equipmentId = new URL(request.url).searchParams.get('equipmentId');
  if (!equipmentId || equipmentId.length > 160)
    return Response.json({ error: 'INVALID_EQUIPMENT_ID' }, { status: 400 });

  const result = await (await credentialService()).getMetadata(equipmentId);
  return result.ok
    ? Response.json(result.value, { headers: { 'Cache-Control': 'no-store' } })
    : Response.json({ error: result.error }, { status: status(result.error) });
}

export async function POST(request: Request) {
  if (!isSafeMutationRequest(request))
    return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });

  const parsed = await readBoundedJson(request, {
    maxBytes: 2048,
    maxDepth: 4,
    maxNodes: 20,
  });
  if (!parsed.ok)
    return Response.json({ error: parsed.error }, { status: jsonBodyErrorStatus(parsed.error) });
  if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value))
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const body = parsed.value as Record<string, unknown>;
  if (
    !hasOnlyKeys(body, ['action', 'equipmentId', 'password', 'currentPassword']) ||
    !isBoundedString(body.action, 32) ||
    !isBoundedString(body.equipmentId, 160)
  )
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const action = body.action;
  const app = await credentialService();

  if (action === 'reveal') {
    if (body.password !== undefined || !isBoundedString(body.currentPassword, 1024))
      return Response.json({ error: 'REAUTHENTICATION_REQUIRED' }, { status: 401 });
    const auth = await requirePermission('credentials:read');
    if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

    const runtime = await getIdentityRuntime();
    const throttleKey = createHash('sha256')
      .update('credential-reveal:' + auth.value.id)
      .digest('base64url');
    if (!(await runtime.throttle.consume(throttleKey, new Date(), 10, 15 * 60_000)))
      return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const operator = await runtime.repository.getUserById(auth.value.id);
    if (
      !operator ||
      operator.lifecycle !== 'ACTIVE' ||
      !(await verifyPassword(body.currentPassword, operator.passwordHash))
    )
      return Response.json({ error: 'REAUTHENTICATION_FAILED' }, { status: 401 });

    const result = await app.revealPassword(body.equipmentId, auth.value.id);
    return result.ok
      ? Response.json(result.value, { headers: { 'Cache-Control': 'no-store' } })
      : Response.json({ error: result.error }, { status: status(result.error) });
  }

  if (body.currentPassword !== undefined)
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  const auth = await requirePermission('credentials:write');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  if (action === 'set') {
    if (!isBoundedString(body.password, 512))
      return Response.json({ error: 'INVALID_PASSWORD' }, { status: 400 });
    const result = await app.setPassword(body.equipmentId, body.password, auth.value.id);
    return result.ok
      ? Response.json(result.value)
      : Response.json({ error: result.error }, { status: status(result.error) });
  }

  if (action === 'remove') {
    if (body.password !== undefined)
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    const result = await app.removePassword(body.equipmentId, auth.value.id);
    return result.ok
      ? Response.json(result.value)
      : Response.json({ error: result.error }, { status: status(result.error) });
  }

  return Response.json({ error: 'INVALID_ACTION' }, { status: 400 });
}
