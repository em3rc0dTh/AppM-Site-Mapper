import type {
  AuthThrottle,
  IdentityRepository,
} from '@/modules/identity/application/identity-repository';
import type { SafeUser, SessionRecord, User } from '@/modules/identity/domain/entities';
import { toSafeUser } from '@/modules/identity/domain/entities';
import { hashPassword, verifyPassword } from '@/modules/identity/domain/password';
import { createSessionToken, hashSessionToken } from '@/modules/identity/domain/session-token';
import type { Permission, Role } from '@/modules/identity/domain/roles';
import { canManageRole, hasPermission } from '@/modules/identity/domain/roles';
import { createDomainId, nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1_000;

export type AuthError =
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'SESSION_INVALID'
  | 'FORBIDDEN'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'USER_EXISTS'
  | 'BOOTSTRAP_CLOSED';

export interface AuthenticatedSession {
  readonly token: string;
  readonly user: SafeUser;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class AuthService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly throttle: AuthThrottle,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async authenticate(
    email: string,
    password: string,
    throttleKey: string,
  ): Promise<Result<AuthenticatedSession, AuthError>> {
    const now = this.clock();

    if (!(await this.throttle.consume(throttleKey, now, LOGIN_LIMIT, LOGIN_WINDOW_MS))) {
      return failure('RATE_LIMITED');
    }

    const user = await this.repository.getUserByEmail(normalizeEmail(email));

    if (
      !user ||
      user.lifecycle !== 'ACTIVE' ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      return failure('INVALID_CREDENTIALS');
    }

    await this.throttle.reset(throttleKey);

    const token = createSessionToken();
    const session: SessionRecord = {
      id: createDomainId(),
      userId: user.id,
      tokenHash: hashSessionToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      revokedAt: null,
    };

    await this.repository.insertSession(session);

    return success({ token, user: toSafeUser(user) });
  }

  async resolveSession(token: string): Promise<SafeUser | null> {
    const session = await this.repository.getSessionByTokenHash(hashSessionToken(token));

    if (!session || session.revokedAt || session.expiresAt.getTime() <= this.clock().getTime()) {
      return null;
    }

    const user = await this.repository.getUserById(session.userId);

    if (!user || user.lifecycle !== 'ACTIVE') {
      return null;
    }

    return toSafeUser(user);
  }

  async authorize(token: string, permission: Permission): Promise<Result<SafeUser, AuthError>> {
    const user = await this.resolveSession(token);

    if (!user) {
      return failure('SESSION_INVALID');
    }

    if (user.mustChangePassword) {
      return failure('PASSWORD_CHANGE_REQUIRED');
    }

    if (!hasPermission(user.role, permission)) {
      return failure('FORBIDDEN');
    }

    return success(user);
  }

  async logout(token: string): Promise<void> {
    const session = await this.repository.getSessionByTokenHash(hashSessionToken(token));

    if (session && !session.revokedAt) {
      await this.repository.revokeSession(session.id, this.clock());
    }
  }

  async changeOwnPassword(
    token: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<Result<SafeUser, AuthError>> {
    const session = await this.repository.getSessionByTokenHash(hashSessionToken(token));

    if (!session || session.revokedAt || session.expiresAt.getTime() <= this.clock().getTime()) {
      return failure('SESSION_INVALID');
    }

    const user = await this.repository.getUserById(session.userId);

    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return failure('INVALID_CREDENTIALS');
    }

    const updated: User = {
      ...user,
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      updatedAt: nowIso(),
    };

    await this.repository.replaceUser(updated);
    await this.repository.revokeUserSessions(user.id, this.clock());

    return success(toSafeUser(updated));
  }

  async bootstrapSuperadmin(
    email: string,
    password: string,
    displayName: string,
  ): Promise<Result<SafeUser, AuthError>> {
    if ((await this.repository.countUsers()) !== 0) {
      return failure('BOOTSTRAP_CLOSED');
    }

    const timestamp = nowIso();
    const user: User = {
      id: createDomainId(),
      email: normalizeEmail(email),
      displayName: displayName.trim(),
      role: 'SUPERADMIN',
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.repository.insertUser(user);
    return success(toSafeUser(user));
  }

  async createUser(
    actor: SafeUser,
    input: Readonly<{
      email: string;
      displayName: string;
      role: Role;
      temporaryPassword: string;
    }>,
  ): Promise<Result<SafeUser, AuthError>> {
    if (!canManageRole(actor.role, input.role)) {
      return failure('FORBIDDEN');
    }

    if (await this.repository.getUserByEmail(input.email)) {
      return failure('USER_EXISTS');
    }

    const timestamp = nowIso();
    const user: User = {
      id: createDomainId(),
      email: normalizeEmail(input.email),
      displayName: input.displayName.trim(),
      role: input.role,
      passwordHash: await hashPassword(input.temporaryPassword),
      mustChangePassword: true,
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.repository.insertUser(user);
    return success(toSafeUser(user));
  }
}
