export type Role = 'SUPERADMIN' | 'ADMIN' | 'STANDARD';

export type Permission =
  | 'topology:read'
  | 'topology:write'
  | 'power:read'
  | 'power:write'
  | 'telemetry:read'
  | 'settings:read'
  | 'settings:write'
  | 'users:manage'
  | 'system:danger';

const permissions: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  STANDARD: new Set<Permission>(['topology:read', 'power:read', 'telemetry:read']),
  ADMIN: new Set<Permission>([
    'topology:read',
    'topology:write',
    'power:read',
    'power:write',
    'telemetry:read',
    'settings:read',
    'settings:write',
  ]),
  SUPERADMIN: new Set<Permission>([
    'topology:read',
    'topology:write',
    'power:read',
    'power:write',
    'telemetry:read',
    'settings:read',
    'settings:write',
    'users:manage',
    'system:danger',
  ]),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissions[role].has(permission);
}

export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === 'SUPERADMIN') {
    return true;
  }

  return actorRole === 'ADMIN' && targetRole === 'STANDARD';
}
