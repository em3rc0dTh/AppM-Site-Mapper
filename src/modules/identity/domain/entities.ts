import type { DomainEntity } from '@/shared/domain/entity';

import type { Role } from './roles';

export interface User extends DomainEntity {
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly passwordHash: string;
  readonly mustChangePassword: boolean;
}

export interface SafeUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly lifecycle: User['lifecycle'];
  readonly mustChangePassword: boolean;
}

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    lifecycle: user.lifecycle,
    mustChangePassword: user.mustChangePassword,
  };
}
