import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { AuthService } from '@/modules/identity/application/auth-service';
import { AUTH_COOKIE_NAME, clearAuthCookie } from '@/modules/identity/infrastructure/auth-cookie';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';

export async function POST(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: 'SESSION_INVALID' }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);

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
