import { describe, expect, it } from 'vitest';

import { canManageRole, hasPermission } from '@/modules/identity/domain/roles';

describe('RBAC policy', () => {
  it('keeps Standard read-only', () => {
    expect(hasPermission('STANDARD', 'topology:read')).toBe(true);
    expect(hasPermission('STANDARD', 'topology:write')).toBe(false);
  });

  it('allows Admin operational writes and alarm acknowledgement but not dangerous system actions', () => {
    expect(hasPermission('ADMIN', 'topology:write')).toBe(true);
    expect(hasPermission('ADMIN', 'alarms:read')).toBe(true);
    expect(hasPermission('ADMIN', 'alarms:ack')).toBe(true);
    expect(hasPermission('ADMIN', 'system:danger')).toBe(false);
  });

  it('keeps Standard alarm access read-only and grants Superadmin full alarm access', () => {
    expect(hasPermission('STANDARD', 'alarms:read')).toBe(true);
    expect(hasPermission('STANDARD', 'alarms:ack')).toBe(false);
    expect(hasPermission('SUPERADMIN', 'alarms:read')).toBe(true);
    expect(hasPermission('SUPERADMIN', 'alarms:ack')).toBe(true);
  });

  it('restricts user-role management', () => {
    expect(canManageRole('ADMIN', 'STANDARD')).toBe(true);
    expect(canManageRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canManageRole('SUPERADMIN', 'ADMIN')).toBe(true);
  });
});
