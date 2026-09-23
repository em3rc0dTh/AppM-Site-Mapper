import { NextResponse } from 'next/server';

import { AuthService } from '@/modules/identity/application/auth-service';
import { requirePermission } from '@/modules/identity/application/current-session';
import type { Role } from '@/modules/identity/domain/roles';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';
import type { LifecycleState } from '@/shared/domain/entity';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

const roles = new Set<Role>(['SUPERADMIN', 'ADMIN', 'STANDARD']);
const lifecycleStates = new Set<LifecycleState>(['ACTIVE', 'ARCHIVED']);

export async function PATCH(request: Request, context: Context) {
  const auth = await requirePermission('users:manage');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const update: {
    displayName?: string;
    role?: Role;
    lifecycle?: LifecycleState;
  } = {};

  if ('displayName' in body) {
    if (typeof body.displayName !== 'string') {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    update.displayName = body.displayName;
  }

  if ('role' in body) {
    if (typeof body.role !== 'string' || !roles.has(body.role as Role)) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    update.role = body.role as Role;
  }

  if ('lifecycle' in body) {
    if (
      typeof body.lifecycle !== 'string' ||
      !lifecycleStates.has(body.lifecycle as LifecycleState)
    ) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    update.lifecycle = body.lifecycle as LifecycleState;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const { id } = await context.params;
  const runtime = await getIdentityRuntime();
  const result = await new AuthService(runtime.repository, runtime.throttle).updateManagedUser(
    auth.value,
    id,
    update,
  );

  if (!result.ok) {
    const status =
      result.error === 'USER_NOT_FOUND' ? 404 : result.error === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ user: result.value });
}
