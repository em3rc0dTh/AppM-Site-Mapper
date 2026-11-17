import { describe, expect, it } from 'vitest';

import { AuthService } from '@/modules/identity/application/auth-service';
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

  it('lets the superadmin recover a user with a temporary password and revokes old sessions', async () => {
    const repository = new MemoryIdentityRepository();
    const throttle = new MemoryAuthThrottle();
    const service = new AuthService(repository, throttle);

    const admin = await service.bootstrapSuperadmin(
      'admin@example.com',
      'superadmin initial password',
      'Admin',
    );
    if (!admin.ok) throw new Error('Expected bootstrap success');

    const created = await service.createUser(admin.value, {
      email: 'operator@example.com',
      displayName: 'Operator',
      role: 'STANDARD',
      temporaryPassword: 'first temporary password',
    });
    if (!created.ok) throw new Error('Expected user creation');

    const initialLogin = await service.authenticate(
      'operator@example.com',
      'first temporary password',
      'operator-initial',
    );
    if (!initialLogin.ok) throw new Error('Expected temporary-password login');

    const reset = await service.resetManagedUserPassword(
      admin.value,
      created.value.id,
      'replacement temporary password',
    );
    expect(reset.ok).toBe(true);
    if (!reset.ok) throw new Error('Expected managed password reset');
    expect(reset.value.mustChangePassword).toBe(true);

    await expect(service.resolveSession(initialLogin.value.token)).resolves.toBeNull();
    await expect(
      service.authenticate(
        'operator@example.com',
        'first temporary password',
        'operator-old-password',
      ),
    ).resolves.toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });

    const recoveredLogin = await service.authenticate(
      'operator@example.com',
      'replacement temporary password',
      'operator-recovered',
    );
    expect(recoveredLogin.ok).toBe(true);
    if (recoveredLogin.ok) {
      expect(recoveredLogin.value.user.mustChangePassword).toBe(true);
    }
  });

  it('renews validated activity and rejects a session idle for 30 minutes', async () => {
    const repository = new MemoryIdentityRepository();
    const throttle = new MemoryAuthThrottle();
    let now = new Date('2026-11-16T08:00:00.000Z');
    const service = new AuthService(repository, throttle, () => now);
    await service.bootstrapSuperadmin('admin@example.com', 'a strong initial password', 'Admin');
    const login = await service.authenticate(
      'admin@example.com',
      'a strong initial password',
      'test-idle',
    );
    if (!login.ok) throw new Error('Expected login success');

    now = new Date('2026-11-16T08:29:00.000Z');
    expect(await service.resolveSession(login.value.token)).not.toBeNull();
    now = new Date('2026-11-16T08:58:00.000Z');
    expect(await service.resolveSession(login.value.token)).not.toBeNull();
    now = new Date('2026-11-16T09:28:00.000Z');
    expect(await service.resolveSession(login.value.token)).toBeNull();
    expect(await service.authorize(login.value.token, 'topology:read')).toEqual({
      ok: false,
      error: 'SESSION_INVALID',
    });
  });

  it('forbids password and profile edits from an idle session', async () => {
    const repository = new MemoryIdentityRepository();
    const throttle = new MemoryAuthThrottle();
    let now = new Date('2026-11-16T08:00:00.000Z');
    const service = new AuthService(repository, throttle, () => now);
    await service.bootstrapSuperadmin('admin@example.com', 'a strong initial password', 'Admin');
    const login = await service.authenticate(
      'admin@example.com',
      'a strong initial password',
      'test-idle-edits',
    );
    if (!login.ok) throw new Error('Expected login success');

    now = new Date('2026-11-16T08:31:00.000Z');
    expect(await service.updateOwnProfile(login.value.token, 'Expired')).toEqual({
      ok: false,
      error: 'SESSION_INVALID',
    });
    expect(
      await service.changeOwnPassword(
        login.value.token,
        'a strong initial password',
        'a different secure password',
      ),
    ).toEqual({ ok: false, error: 'SESSION_INVALID' });
  });

  it('keeps absolute expiry and logout revocation authoritative', async () => {
    const repository = new MemoryIdentityRepository();
    const throttle = new MemoryAuthThrottle();
    let now = new Date('2026-11-16T08:00:00.000Z');
    const service = new AuthService(repository, throttle, () => now);
    await service.bootstrapSuperadmin('admin@example.com', 'a strong initial password', 'Admin');
    const login = await service.authenticate(
      'admin@example.com',
      'a strong initial password',
      'test-absolute',
    );
    if (!login.ok) throw new Error('Expected login success');

    for (let minutes = 10; minutes < 480; minutes += 10) {
      now = new Date(Date.parse('2026-11-16T08:00:00.000Z') + minutes * 60_000);
      expect(await service.resolveSession(login.value.token)).not.toBeNull();
    }
    now = new Date('2026-11-16T16:00:00.000Z');
    expect(await service.resolveSession(login.value.token)).toBeNull();

    const second = await service.authenticate(
      'admin@example.com',
      'a strong initial password',
      'test-revoked',
    );
    if (!second.ok) throw new Error('Expected a new login');
    await service.logout(second.value.token);
    now = new Date('2026-11-16T16:06:00.000Z');
    expect(await service.resolveSession(second.value.token)).toBeNull();
  });
  it('rejects excessively long credentials before expensive authentication work', async () => {
    const repo = new MemoryIdentityRepository();
    const limiter = new MemoryAuthThrottle();
    const app = new AuthService(repo, limiter);
    await expect(
      app.authenticate('x'.repeat(255), 'strong password 2026', 'oversized'),
    ).resolves.toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
    await expect(
      app.authenticate('admin@example.com', 'x'.repeat(1025), 'oversized'),
    ).resolves.toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
    await expect(
      app.bootstrapSuperadmin('admin@example.com', 'strong password 2026', 'a'.repeat(121)),
    ).resolves.toEqual({ ok: false, error: 'INVALID_INPUT' });
  });
  it('throttles repeated current-password guesses without mutating the user', async () => {
    const repository = new MemoryIdentityRepository();
    const limiter = new MemoryAuthThrottle();
    const service = new AuthService(repository, limiter);
    await service.bootstrapSuperadmin('admin@example.com', 'secure unchanged password', 'Admin');
    const login = await service.authenticate(
      'admin@example.com',
      'secure unchanged password',
      'password-guessing-login',
    );
    if (!login.ok) throw new Error('Expected login');
    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.changeOwnPassword(login.value.token, 'wrong password', 'new safe password 2026'),
      ).resolves.toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
    }
    await expect(
      service.changeOwnPassword(
        login.value.token,
        'secure unchanged password',
        'new safe password 2026',
      ),
    ).resolves.toEqual({ ok: false, error: 'RATE_LIMITED' });
  });
});
