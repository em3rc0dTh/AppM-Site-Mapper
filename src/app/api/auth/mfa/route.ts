import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { MfaService } from '@/modules/identity/application/mfa-service';
import { AUTH_COOKIE_NAME, clearAuthCookie } from '@/modules/identity/infrastructure/auth-cookie';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';
import { integrityErrorResponse } from '@/shared/http/integrity-error';
import {
  hasOnlyKeys,
  isBoundedString,
  isSafeMutationRequest,
  jsonBodyErrorStatus,
  readBoundedJson,
} from '@/shared/http/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function service() {
  const runtime = await getIdentityRuntime();
  return new MfaService(runtime.repository, runtime.throttle);
}

async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(AUTH_COOKIE_NAME)?.value;
}

export async function GET() {
  const token = await sessionToken();
  if (!token) return Response.json({ error: 'SESSION_INVALID' }, { status: 401 });
  const result = await (await service()).status(token);
  if (!result.ok) return Response.json({ error: result.error }, { status: 401 });
  return Response.json(result.value, { headers: { 'Cache-Control': 'no-store' } });
}

async function handlePost(request: Request) {
  const token = await sessionToken();
  if (!token) return Response.json({ error: 'SESSION_INVALID' }, { status: 401 });
  if (!isSafeMutationRequest(request))
    return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });

  const parsed = await readBoundedJson(request, { maxBytes: 1024, maxDepth: 2, maxNodes: 8 });
  if (!parsed.ok)
    return Response.json({ error: parsed.error }, { status: jsonBodyErrorStatus(parsed.error) });
  if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value))
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  const body = parsed.value as Record<string, unknown>;
  if (!hasOnlyKeys(body, ['action', 'currentPassword', 'code']) || !isBoundedString(body.action, 16))
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const app = await service();
  const result =
    body.action === 'start' && isBoundedString(body.currentPassword, 1024)
      ? await app.start(token, body.currentPassword)
      : body.action === 'confirm' && isBoundedString(body.code, 6)
        ? await app.confirm(token, body.code)
        : body.action === 'disable' &&
            isBoundedString(body.currentPassword, 1024) &&
            isBoundedString(body.code, 6)
          ? await app.disable(token, body.currentPassword, body.code)
          : null;
  if (!result) return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  if (!result.ok) {
    const status =
      result.error === 'RATE_LIMITED'
        ? 429
        : result.error === 'MFA_KEY_NOT_CONFIGURED'
          ? 503
          : result.error === 'SESSION_INVALID' || result.error === 'PASSWORD_INVALID'
            ? 401
            : 422;
    return Response.json({ error: result.error }, { status });
  }
  const response = NextResponse.json(result.value, { headers: { 'Cache-Control': 'no-store' } });
  if (body.action !== 'start') clearAuthCookie(response);
  return response;
}

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (error) {
    return integrityErrorResponse(error);
  }
}
