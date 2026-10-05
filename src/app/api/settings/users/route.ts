import { NextResponse } from 'next/server';

import { AuthService } from '@/modules/identity/application/auth-service';
import { requirePermission } from '@/modules/identity/application/current-session';
import type { Role } from '@/modules/identity/domain/roles';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';

const roles = new Set<Role>(['SUPERADMIN', 'ADMIN', 'STANDARD']);

export async function GET() {
  const auth = await requirePermission('users:manage');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const runtime = await getIdentityRuntime();
  const result = await new AuthService(runtime.repository, runtime.throttle).listUsers(auth.value);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  return NextResponse.json({ users: result.value });
}

export async function POST(request: Request) {
  const auth = await requirePermission('users:manage');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);

  if (
    !body ||
    typeof body !== 'object' ||
    !('email' in body) ||
    !('displayName' in body) ||
    !('role' in body) ||
    !('temporaryPassword' in body) ||
    typeof body.email !== 'string' ||
    typeof body.displayName !== 'string' ||
    typeof body.role !== 'string' ||
    !roles.has(body.role as Role) ||
    typeof body.temporaryPassword !== 'string'
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const runtime = await getIdentityRuntime();
  const result = await new AuthService(runtime.repository, runtime.throttle).createUser(
    auth.value,
    {
      email: body.email,
      displayName: body.displayName,
      role: body.role as Role,
      temporaryPassword: body.temporaryPassword,
    },
  );

  if (!result.ok) {
    const status = result.error === 'USER_EXISTS' ? 409 : result.error === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ user: result.value }, { status: 201 });
}
