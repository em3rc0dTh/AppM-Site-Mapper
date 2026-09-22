import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type {
  AuthThrottle,
  IdentityRepository,
} from '@/modules/identity/application/identity-repository';
import type { SessionRecord, User } from '@/modules/identity/domain/entities';

type UserDocument = User & Document;
type SessionDocument = SessionRecord & Document;

interface RateLimitDocument extends Document {
  key: string;
  count: number;
  windowStartedAt: Date;
  expiresAt: Date;
}

function withoutMongoId<T>(document: T & Document): T {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  return copy as unknown as T;
}

export class MongoIdentityRepository implements IdentityRepository {
  private readonly users: Collection<UserDocument>;
  private readonly sessions: Collection<SessionDocument>;

  constructor(database: Db) {
    this.users = database.collection<UserDocument>('users');
    this.sessions = database.collection<SessionDocument>('sessions');
  }

  async countUsers(): Promise<number> {
    return this.users.countDocuments({});
  }

  async getUserById(id: string): Promise<User | null> {
    const document = await this.users.findOne({ id });
    return document ? withoutMongoId<User>(document) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const document = await this.users.findOne({ email: email.trim().toLowerCase() });
    return document ? withoutMongoId<User>(document) : null;
  }

  async insertUser(user: User): Promise<void> {
    await this.users.insertOne(user as OptionalUnlessRequiredId<UserDocument>);
  }

  async replaceUser(user: User): Promise<void> {
    const result = await this.users.replaceOne(
      { id: user.id },
      user as OptionalUnlessRequiredId<UserDocument>,
    );

    if (result.matchedCount !== 1) {
      throw new Error('User does not exist.');
    }
  }

  async insertSession(session: SessionRecord): Promise<void> {
    await this.sessions.insertOne(session as OptionalUnlessRequiredId<SessionDocument>);
  }

  async getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const document = await this.sessions.findOne({ tokenHash });
    return document ? withoutMongoId<SessionRecord>(document) : null;
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    await this.sessions.updateOne({ id: sessionId }, { $set: { revokedAt } });
  }

  async revokeUserSessions(userId: string, revokedAt: Date): Promise<void> {
    await this.sessions.updateMany({ userId, revokedAt: null }, { $set: { revokedAt } });
  }
}

export class MongoAuthThrottle implements AuthThrottle {
  private readonly limits: Collection<RateLimitDocument>;

  constructor(database: Db) {
    this.limits = database.collection<RateLimitDocument>('auth_rate_limits');
  }

  async consume(key: string, now: Date, limit: number, windowMs: number): Promise<boolean> {
    const existing = await this.limits.findOne({ key });
    const windowExpired =
      !existing || now.getTime() - existing.windowStartedAt.getTime() >= windowMs;

    if (windowExpired) {
      await this.limits.replaceOne(
        { key },
        {
          key,
          count: 1,
          windowStartedAt: now,
          expiresAt: new Date(now.getTime() + windowMs),
        },
        { upsert: true },
      );
      return true;
    }

    if (existing.count >= limit) {
      return false;
    }

    const updated = await this.limits.updateOne(
      { key, count: { $lt: limit }, windowStartedAt: existing.windowStartedAt },
      { $inc: { count: 1 } },
    );

    return updated.modifiedCount === 1;
  }

  async reset(key: string): Promise<void> {
    await this.limits.deleteOne({ key });
  }
}
