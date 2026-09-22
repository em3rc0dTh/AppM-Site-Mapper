import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { AuthService } from '@/modules/identity/application/auth-service';
import { AUTH_COOKIE_NAME, clearAuthCookie } from '@/modules/identity/infrastructure/auth-cookie';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';

export async function POST() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    const runtime = await getIdentityRuntime();
    await new AuthService(runtime.repository, runtime.throttle).logout(token);
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookie(response);
  return response;
}
