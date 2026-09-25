import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getAuditRuntime } from '@/modules/audit/infrastructure/audit-runtime';
import { AuthService } from '@/modules/identity/application/auth-service';
import { AUTH_COOKIE_NAME, clearAuthCookie } from '@/modules/identity/infrastructure/auth-cookie';
import { getIdentityRuntime } from '@/modules/identity/infrastructure/identity-runtime';

export async function POST() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    const runtime = await getIdentityRuntime();
    const service = new AuthService(runtime.repository, runtime.throttle);
    const user = await service.resolveSession(token);
    await service.logout(token);

    if (user) {
      const audit = await getAuditRuntime();
      await audit.service.record({
        actor: { type: 'USER', userId: user.id },
        action: 'AUTH.SESSION_REVOKED',
        target: { kind: 'USER', id: user.id },
        metadata: { reason: 'LOGOUT' },
      });
    }
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookie(response);
  return response;
}
