import type { SessionRecord, User } from '@/modules/identity/domain/entities';

export interface IdentityRepository {
  countUsers(): Promise<number>;
  listUsers(): Promise<readonly User[]>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  insertInitialUser(user: User): Promise<boolean>;
  insertUser(user: User): Promise<void>;
  replaceUser(user: User): Promise<void>;
  insertSession(session: SessionRecord): Promise<void>;
  getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  revokeSession(sessionId: string, revokedAt: Date): Promise<void>;
  revokeUserSessions(userId: string, revokedAt: Date): Promise<void>;
}

export interface AuthThrottle {
  consume(key: string, now: Date, limit: number, windowMs: number): Promise<boolean>;
  reset(key: string): Promise<void>;
}
