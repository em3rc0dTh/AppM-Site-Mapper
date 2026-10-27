import { integrityErrorResponse } from '@/shared/http/integrity-error';
import {
  readBoundedJson as readHardenedJson,
  jsonBodyErrorStatus as hardenedJsonStatus,
  isSafeMutationRequest as hardenedSafeMutation,
} from '@/shared/http/request-security';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { AuthService } from '@/modules/identity/application/auth-service';
import { AUTH_COOKIE_NAME, clearAuthCookie } from '@/modules/identity/infrastructure/auth-cookie';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';

async function handlePOST(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: 'SESSION_INVALID' }, { status: 401 });
  }

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
    !('currentPassword' in body) ||
    !('newPassword' in body) ||
    typeof body.currentPassword !== 'string' ||
    typeof body.newPassword !== 'string'
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const runtime = await getIdentityRuntime();
  const result = await new AuthService(runtime.repository, runtime.throttle).changeOwnPassword(
    token,
    body.currentPassword,
    body.newPassword,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const response = NextResponse.json({
    user: result.value,
    reauthenticationRequired: true,
  });
  clearAuthCookie(response);
  return response;
}

export async function POST(request: Request) {
  try {
    return await handlePOST(request);
  } catch (error) {
    return integrityErrorResponse(error);
  }
}
