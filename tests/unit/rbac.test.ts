import { describe, expect, it } from 'vitest';

import { canManageRole, hasPermission } from '@/modules/identity/domain/roles';

describe('RBAC policy', () => {
  it('keeps Standard read-only', () => {
    expect(hasPermission('STANDARD', 'topology:read')).toBe(true);
    expect(hasPermission('STANDARD', 'topology:write')).toBe(false);
  });

  it('allows Admin operational writes but not dangerous system actions', () => {
    expect(hasPermission('ADMIN', 'topology:write')).toBe(true);
    expect(hasPermission('ADMIN', 'system:danger')).toBe(false);
  });

  it('restricts user-role management', () => {
    expect(canManageRole('ADMIN', 'STANDARD')).toBe(true);
    expect(canManageRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canManageRole('SUPERADMIN', 'ADMIN')).toBe(true);
  });
});
