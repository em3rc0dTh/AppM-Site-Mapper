import type {
  AuthThrottle,
  IdentityRepository,
} from '@/modules/identity/application/identity-repository';
import type { SessionRecord, User } from '@/modules/identity/domain/entities';

export class MemoryIdentityRepository implements IdentityRepository {
  private readonly users = new Map<string, User>();
  private readonly sessions = new Map<string, SessionRecord>();

  async countUsers(): Promise<number> {
    return this.users.size;
  }

  async getUserById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? structuredClone(user) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    const user = [...this.users.values()].find((candidate) => candidate.email === normalized);
    return user ? structuredClone(user) : null;
  }

  async insertUser(user: User): Promise<void> {
    if (this.users.has(user.id) || (await this.getUserByEmail(user.email))) {
      throw new Error('User already exists.');
    }

    this.users.set(user.id, structuredClone(user));
  }

  async replaceUser(user: User): Promise<void> {
    if (!this.users.has(user.id)) {
      throw new Error('User does not exist.');
    }

    this.users.set(user.id, structuredClone(user));
  }

  async insertSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, structuredClone(session));
  }

  async getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.tokenHash === tokenHash,
    );

    return session ? structuredClone(session) : null;
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (session) {
      this.sessions.set(sessionId, { ...session, revokedAt });
    }
  }

  async revokeUserSessions(userId: string, revokedAt: Date): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.userId === userId && !session.revokedAt) {
        this.sessions.set(id, { ...session, revokedAt });
      }
    }
  }
}

interface WindowState {
  count: number;
  startedAt: number;
}

export class MemoryAuthThrottle implements AuthThrottle {
  private readonly windows = new Map<string, WindowState>();

  async consume(key: string, now: Date, limit: number, windowMs: number): Promise<boolean> {
    const current = this.windows.get(key);
    const nowMs = now.getTime();

    if (!current || nowMs - current.startedAt >= windowMs) {
      this.windows.set(key, { count: 1, startedAt: nowMs });
      return true;
    }

    if (current.count >= limit) {
      return false;
    }

    this.windows.set(key, { ...current, count: current.count + 1 });
    return true;
  }

  async reset(key: string): Promise<void> {
    this.windows.delete(key);
  }
}
