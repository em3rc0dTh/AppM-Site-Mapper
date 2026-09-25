import {
  type Collection,
  type Db,
  type Document,
  MongoServerError,
  type OptionalUnlessRequiredId,
} from 'mongodb';

import type {
  AuthThrottle,
  IdentityRepository,
} from '@/modules/identity/application/identity-repository';
import type { SessionRecord, User } from '@/modules/identity/domain/entities';

type UserDocument = User &
  Document & {
    bootstrapSlot?: 'initial';
  };
type SessionDocument = SessionRecord & Document;

interface RateLimitDocument extends Document {
  key: string;
  count: number;
  windowStartedAt: Date;
  expiresAt: Date;
}

function toUser(document: UserDocument): User {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  delete copy.bootstrapSlot;
  return copy as unknown as User;
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

  async listUsers(): Promise<readonly User[]> {
    const documents = await this.users.find({}).sort({ email: 1 }).toArray();
    return documents.map(toUser);
  }

  async getUserById(id: string): Promise<User | null> {
    const document = await this.users.findOne({ id });
    return document ? toUser(document) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const document = await this.users.findOne({ email: email.trim().toLowerCase() });
    return document ? toUser(document) : null;
  }

  async insertInitialUser(user: User): Promise<boolean> {
    try {
      await this.users.insertOne({
        ...user,
        bootstrapSlot: 'initial',
      } as OptionalUnlessRequiredId<UserDocument>);
      return true;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        return false;
      }

      throw error;
    }
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
    const cutoff = new Date(now.getTime() - windowMs);
    const expiresAt = new Date(now.getTime() + windowMs);
    const expiredExpression = {
      $or: [
        { $eq: [{ $type: '$windowStartedAt' }, 'missing'] },
        { $lte: ['$windowStartedAt', cutoff] },
      ],
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const document = await this.limits.findOneAndUpdate(
          { key },
          [
            {
              $set: {
                key,
                count: {
                  $cond: [
                    expiredExpression,
                    1,
                    {
                      $min: [
                        { $add: [{ $ifNull: ['$count', 0] }, 1] },
                        limit + 1,
                      ],
                    },
                  ],
                },
                windowStartedAt: {
                  $cond: [expiredExpression, now, '$windowStartedAt'],
                },
                expiresAt: {
                  $cond: [expiredExpression, expiresAt, '$expiresAt'],
                },
              },
            },
          ],
          {
            upsert: true,
            returnDocument: 'after',
          },
        );

        return document !== null && document.count <= limit;
      } catch (error) {
        if (attempt === 0 && error instanceof MongoServerError && error.code === 11000) {
          continue;
        }

        throw error;
      }
    }

    return false;
  }

  async reset(key: string): Promise<void> {
    await this.limits.deleteOne({ key });
  }
}
