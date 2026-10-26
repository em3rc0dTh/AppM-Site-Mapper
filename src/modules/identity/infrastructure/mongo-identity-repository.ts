import { randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongodb';
import {
  withIntegrityTransaction,
  IntegrityConflict,
} from '@/shared/infrastructure/mongodb/integrity-transaction';
import { canManageRole, hasPermission } from '@/modules/identity/domain/roles';
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

  constructor(private readonly database: Db) {
    this.users = database.collection<UserDocument>('users');
    this.sessions = database.collection<SessionDocument>('sessions');
  }

  async countUsers(): Promise<number> {
    return this.users.countDocuments({});
  }

  async listUsers(): Promise<readonly User[]> {
    const documents = await this.users.find({}).sort({ email: 1 }).toArray();
    return documents.map((document) => withoutMongoId<User>(document));
  }

  async getUserById(id: string): Promise<User | null> {
    const document = await this.users.findOne({ id });
    return document ? withoutMongoId<User>(document) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const document = await this.users.findOne({ email: email.trim().toLowerCase() });
    return document ? withoutMongoId<User>(document) : null;
  }

  private async audit(actorId: string, action: string, targetId: string, session: ClientSession) {
    await this.database
      .collection('admin_audit')
      .insertOne(
        { id: randomUUID(), actorId, action, targetId, at: new Date().toISOString() },
        { session },
      );
  }

  async bootstrapUser(user: User): Promise<boolean> {
    return withIntegrityTransaction(this.database, async (session) => {
      const state = this.database.collection('identity_initialization');
      if (
        (await state.findOne({ key: 'bootstrap' }, { session })) ||
        (await this.users.countDocuments({}, { session }))
      )
        return false;
      await state.insertOne(
        { key: 'bootstrap', initializedAt: new Date(), userId: user.id },
        { session },
      );
      await this.users.insertOne(
        { ...user, revision: 1 } as OptionalUnlessRequiredId<UserDocument>,
        { session },
      );
      await this.audit(user.id, 'BOOTSTRAP_SUPERADMIN', user.id, session);
      return true;
    });
  }

  async insertUser(user: User, actorId?: string): Promise<void> {
    await withIntegrityTransaction(this.database, async (session) => {
      if (!actorId) throw new IntegrityConflict('ACTOR_REQUIRED');
      const actor = await this.users.findOne({ id: actorId, lifecycle: 'ACTIVE' }, { session });
      if (
        !actor ||
        actor.mustChangePassword ||
        !hasPermission(actor.role, 'users:manage') ||
        !canManageRole(actor.role, user.role)
      )
        throw new IntegrityConflict('FORBIDDEN');
      await this.users.insertOne(
        { ...user, revision: 1 } as OptionalUnlessRequiredId<UserDocument>,
        { session },
      );
      await this.audit(actorId, 'USER_CREATE', user.id, session);
    });
  }

  async replaceUser(user: User, expected?: User, actorId?: string): Promise<void> {
    if (!expected || !actorId) throw new IntegrityConflict('USER_VERSION_REQUIRED');
    await withIntegrityTransaction(this.database, async (session) => {
      const current = await this.users.findOne({ id: user.id }, { session });
      if (
        !current ||
        current.revision !== expected.revision ||
        current.updatedAt !== expected.updatedAt
      )
        throw new IntegrityConflict('USER_CONFLICT');
      const actor = await this.users.findOne({ id: actorId, lifecycle: 'ACTIVE' }, { session });
      if (
        !actor ||
        (actorId !== user.id &&
          (actor.mustChangePassword ||
            !hasPermission(actor.role, 'users:manage') ||
            !canManageRole(actor.role, current.role) ||
            !canManageRole(actor.role, user.role)))
      )
        throw new IntegrityConflict('FORBIDDEN');
      if (
        actorId === user.id &&
        (user.role !== current.role || user.lifecycle !== current.lifecycle)
      )
        throw new IntegrityConflict('SELF_MANAGEMENT_RESTRICTED');
      if (
        current.role === 'SUPERADMIN' &&
        current.lifecycle === 'ACTIVE' &&
        (user.role !== 'SUPERADMIN' || user.lifecycle !== 'ACTIVE')
      ) {
        if (
          (await this.users.countDocuments(
            { role: 'SUPERADMIN', lifecycle: 'ACTIVE' },
            { session },
          )) <= 1
        )
          throw new IntegrityConflict('LAST_SUPERADMIN');
      }
      const result = await this.users.replaceOne(
        {
          id: user.id,
          ...(expected.revision === undefined
            ? { revision: { $exists: false }, updatedAt: expected.updatedAt }
            : { revision: expected.revision }),
        },
        {
          ...user,
          revision: (current.revision ?? 0) + 1,
        } as OptionalUnlessRequiredId<UserDocument>,
        { session },
      );
      if (result.matchedCount !== 1) throw new IntegrityConflict('USER_CONFLICT');
      if (
        user.lifecycle !== 'ACTIVE' ||
        user.role !== current.role ||
        user.passwordHash !== current.passwordHash ||
        user.mustChangePassword !== current.mustChangePassword
      ) {
        await this.sessions.updateMany(
          { userId: user.id, revokedAt: null },
          { $set: { revokedAt: new Date() } },
          { session },
        );
      }
      await this.audit(
        actorId,
        user.passwordHash !== current.passwordHash ? 'PASSWORD_CHANGE' : 'USER_UPDATE',
        user.id,
        session,
      );
    });
  }

  async insertSession(record: SessionRecord, expectedUser?: User): Promise<void> {
    if (!expectedUser) throw new IntegrityConflict('SESSION_INVALID');
    await withIntegrityTransaction(this.database, async (session) => {
      const user = await this.users.findOne(
        { id: record.userId, lifecycle: 'ACTIVE' },
        { session },
      );
      if (
        !user ||
        user.revision !== expectedUser.revision ||
        user.passwordHash !== expectedUser.passwordHash
      )
        throw new IntegrityConflict('SESSION_INVALID');
      await this.sessions.insertOne(record as OptionalUnlessRequiredId<SessionDocument>, {
        session,
      });
    });
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
    // Fixed-window key makes first-use increments atomic, including rollover.
    const started = Math.floor(now.getTime() / windowMs) * windowMs;
    const windowKey = `${key}:${started}`;
    try {
      const record = await this.limits.findOneAndUpdate(
        { key: windowKey },
        {
          $inc: { count: 1 },
          $setOnInsert: {
            windowStartedAt: new Date(started),
            expiresAt: new Date(started + windowMs),
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      return Boolean(record && record.count <= limit);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
        return false;
      throw error;
    }
  }

  async reset(key: string): Promise<void> {
    void key; // Successful login does not reset a shared concurrent abuse budget.
  }
}
