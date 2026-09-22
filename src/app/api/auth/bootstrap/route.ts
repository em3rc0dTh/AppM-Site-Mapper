import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { requireRuntimeSecret } from '@/config/env';
import { AuthService } from '@/modules/identity/application/auth-service';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function POST(request: Request) {
  const configuredToken = requireRuntimeSecret(
    'BOOTSTRAP_ADMIN_TOKEN',
    process.env.BOOTSTRAP_ADMIN_TOKEN,
  );
  const authorization = request.headers.get('authorization');
  const suppliedToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!suppliedToken || !secureEqual(configuredToken, suppliedToken)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);

  if (
    !body ||
    typeof body !== 'object' ||
    !('email' in body) ||
    !('password' in body) ||
    !('displayName' in body) ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string' ||
    typeof body.displayName !== 'string'
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const runtime = await getIdentityRuntime();
  const result = await new AuthService(runtime.repository, runtime.throttle).bootstrapSuperadmin(
    body.email,
    body.password,
    body.displayName,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ user: result.value }, { status: 201 });
}
