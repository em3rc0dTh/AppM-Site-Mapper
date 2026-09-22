import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import { AuthService } from '@/modules/identity/application/auth-service';
import { setAuthCookie } from '@/modules/identity/infrastructure/auth-cookie';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';

function throttleKey(request: Request, email: string): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  return createHash('sha256')
    .update(`${forwarded}:${email.trim().toLowerCase()}`)
    .digest('base64url');
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);

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
