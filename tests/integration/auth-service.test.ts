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
    await expect(app.authenticate('x'.repeat(255), 'strong password 2026', 'oversized')).resolves.toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
    await expect(app.authenticate('admin@example.com', 'x'.repeat(1025), 'oversized')).resolves.toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
    await expect(app.bootstrapSuperadmin('admin@example.com', 'strong password 2026', 'a'.repeat(121)))
      .resolves.toEqual({ ok: false, error: 'INVALID_INPUT' });
  });
});
