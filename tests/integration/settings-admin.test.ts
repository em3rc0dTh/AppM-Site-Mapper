import { describe, expect, it } from 'vitest';

import { AuthService } from '@/modules/identity/application/auth-service';
import type { User } from '@/modules/identity/domain/entities';
import { hashPassword } from '@/modules/identity/domain/password';
import {
  MemoryAuthThrottle,
  MemoryIdentityRepository,
} from '@/modules/identity/infrastructure/memory-identity-repository';

const timestamp = '2026-09-22T00:00:00.000Z';

async function user(input: Partial<User> & Pick<User, 'id' | 'email' | 'role'>): Promise<User> {
  return {
    id: input.id,
    email: input.email,
    displayName: input.displayName ?? input.email,
    role: input.role,
    passwordHash: input.passwordHash ?? (await hashPassword('temporary-password-123')),
    mustChangePassword: input.mustChangePassword ?? false,
    lifecycle: input.lifecycle ?? 'ACTIVE',
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
}

describe('G12 user administration', () => {
  it('protects the final active Superadmin and allows managed Standard archival', async () => {
    const superadmin = await user({
      id: 'root',
      email: 'root@example.test',
      role: 'SUPERADMIN',
    });
    const standard = await user({
      id: 'standard',
      email: 'standard@example.test',
      role: 'STANDARD',
    });
    const repository = new MemoryIdentityRepository([superadmin, standard]);
    const service = new AuthService(repository, new MemoryAuthThrottle());

    const actorResult = await service.listUsers({
      id: superadmin.id,
      email: superadmin.email,
      displayName: superadmin.displayName,
      role: superadmin.role,
      lifecycle: superadmin.lifecycle,
      mustChangePassword: false,
    });

    expect(actorResult.ok).toBe(true);

    const selfArchive = await service.updateManagedUser(
      {
        id: superadmin.id,
        email: superadmin.email,
        displayName: superadmin.displayName,
        role: superadmin.role,
        lifecycle: superadmin.lifecycle,
        mustChangePassword: false,
      },
      superadmin.id,
      { lifecycle: 'ARCHIVED' },
    );

    expect(selfArchive).toEqual({ ok: false, error: 'SELF_MANAGEMENT_RESTRICTED' });

    const archived = await service.updateManagedUser(
      {
        id: superadmin.id,
        email: superadmin.email,
        displayName: superadmin.displayName,
        role: superadmin.role,
        lifecycle: superadmin.lifecycle,
        mustChangePassword: false,
      },
      standard.id,
      { lifecycle: 'ARCHIVED' },
    );

    expect(archived.ok).toBe(true);
    if (archived.ok) {
      expect(archived.value.lifecycle).toBe('ARCHIVED');
    }
  });

  it('rejects user administration by Standard role', async () => {
    const standard = await user({
      id: 'standard',
      email: 'standard@example.test',
      role: 'STANDARD',
    });
    const repository = new MemoryIdentityRepository([standard]);
    const service = new AuthService(repository, new MemoryAuthThrottle());

    const result = await service.listUsers({
      id: standard.id,
      email: standard.email,
      displayName: standard.displayName,
      role: standard.role,
      lifecycle: standard.lifecycle,
      mustChangePassword: false,
    });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});
