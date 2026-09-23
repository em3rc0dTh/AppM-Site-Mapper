import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { AuthService } from '@/modules/identity/application/auth-service';
import { AUTH_COOKIE_NAME } from '@/modules/identity/infrastructure/auth-cookie';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';

export async function PATCH(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: 'SESSION_INVALID' }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);

  if (
    !body ||
    typeof body !== 'object' ||
    !('displayName' in body) ||
    typeof body.displayName !== 'string'
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const runtime = await getIdentityRuntime();
  const result = await new AuthService(runtime.repository, runtime.throttle).updateOwnProfile(
    token,
    body.displayName,
  );

  if (!result.ok) {
    const status = result.error === 'SESSION_INVALID' ? 401 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ user: result.value });
}
