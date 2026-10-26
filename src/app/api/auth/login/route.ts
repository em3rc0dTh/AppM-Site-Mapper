import { integrityErrorResponse } from '@/shared/http/integrity-error';
import {
  readBoundedJson as readHardenedJson,
  jsonBodyErrorStatus as hardenedJsonStatus,
  isSafeMutationRequest as hardenedSafeMutation,
} from '@/shared/http/request-security';
import { trustedClientAddress } from '@/shared/http/trusted-proxy';
import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import { AuthService } from '@/modules/identity/application/auth-service';
import { setAuthCookie } from '@/modules/identity/infrastructure/auth-cookie';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';

function throttleKey(request: Request, email: string): string {
  void request;

  return createHash('sha256').update(`account:${email.trim().toLowerCase()}`).digest('base64url');
}

async function handlePOST(request: Request) {
  if (!hardenedSafeMutation(request))
    return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const parsedBody = await readHardenedJson(request);
  if (!parsedBody.ok)
    return Response.json(
      { error: parsedBody.error },
      { status: hardenedJsonStatus(parsedBody.error) },
    );
  const body: unknown = parsedBody.value;

  if (
    !body ||
    typeof body !== 'object' ||
    !('email' in body) ||
    !('password' in body) ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const runtime = await getIdentityRuntime();
  const addressKey = createHash('sha256')
    .update('edge:' + trustedClientAddress(request))
    .digest('base64url');
  if (!(await runtime.throttle.consume(addressKey, new Date(), 60, 60_000)))
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const result = await new AuthService(runtime.repository, runtime.throttle).authenticate(
    body.email,
    body.password,
    throttleKey(request, body.email),
  );

  if (!result.ok) {
    const status = result.error === 'RATE_LIMITED' ? 429 : 401;
    return NextResponse.json({ error: result.error }, { status });
  }

  const response = NextResponse.json({ user: result.value.user });
  setAuthCookie(response, result.value.token);
  return response;
}

export async function POST(request: Request) {
  try {
    return await handlePOST(request);
  } catch (error) {
    return integrityErrorResponse(error);
  }
}
