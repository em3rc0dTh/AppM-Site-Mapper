import { describe, expect, it } from 'vitest';

import { AuthService } from '@/modules/identity/application/auth-service';
import { MAX_PASSWORD_LENGTH } from '@/modules/identity/domain/password';
import {
  MemoryAuthThrottle,
  MemoryIdentityRepository,
} from '@/modules/identity/infrastructure/memory-identity-repository';

describe('AuthService', () => {
  it('bootstraps once, authenticates and resolves server-authoritative sessions', async () => {
    const repository = new MemoryIdentityRepository();
    const throttle = new MemoryAuthThrottle();
    const service = new AuthService(repository, throttle);

    const bootstrapped = await service.bootstrapSuperadmin(
      'admin@example.com',
      'a strong initial password',
      'Admin',
    );

    expect(bootstrapped.ok).toBe(true);

    const secondBootstrap = await service.bootstrapSuperadmin(
      'other@example.com',
      'another strong password',
      'Other',
    );

    expect(secondBootstrap).toEqual({ ok: false, error: 'BOOTSTRAP_CLOSED' });

    const login = await service.authenticate(
      'ADMIN@example.com',
      'a strong initial password',
      'test-key',
    );

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('Expected login success.');
    }

    await expect(service.resolveSession(login.value.token)).resolves.toMatchObject({
      email: 'admin@example.com',
      role: 'SUPERADMIN',
    });
  });

  it('rejects oversized login passwords before password derivation', async () => {
    const repository = new MemoryIdentityRepository();
    const throttle = new MemoryAuthThrottle();
    const service = new AuthService(repository, throttle);

    await service.bootstrapSuperadmin('admin@example.com', 'a strong initial password', 'Admin');

    await expect(
      service.authenticate(
        'admin@example.com',
        'x'.repeat(MAX_PASSWORD_LENGTH + 1),
        'oversized-test-key',
      ),
    ).resolves.toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
  });

  it('revokes every session after a password change', async () => {
    const repository = new MemoryIdentityRepository();
    const throttle = new MemoryAuthThrottle();
    const service = new AuthService(repository, throttle);

    await service.bootstrapSuperadmin('admin@example.com', 'old password is strong', 'Admin');

    const login = await service.authenticate(
      'admin@example.com',
      'old password is strong',
      'test-key',
    );

    if (!login.ok) {
      throw new Error('Expected login success.');
    }

    const changed = await service.changeOwnPassword(
      login.value.token,
      'old password is strong',
      'new password is stronger',
    );

    expect(changed.ok).toBe(true);
    await expect(service.resolveSession(login.value.token)).resolves.toBeNull();
  });
});
