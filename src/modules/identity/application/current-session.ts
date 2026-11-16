import { cookies } from 'next/headers';

import { AuthService } from '@/modules/identity/application/auth-service';
import type { Permission } from '@/modules/identity/domain/roles';
import { AUTH_COOKIE_NAME } from '@/modules/identity/infrastructure/auth-cookie';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';

export async function getCurrentSessionUser() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const runtime = await getIdentityRuntime();
  return new AuthService(runtime.repository, runtime.throttle).resolveSession(token);
}

export async function requirePermission(permission: Permission) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return { ok: false as const, error: 'SESSION_INVALID' as const };
  }

  const runtime = await getIdentityRuntime();
  return new AuthService(runtime.repository, runtime.throttle).authorize(token, permission);
}
