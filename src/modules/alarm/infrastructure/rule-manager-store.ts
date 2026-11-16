import { createHash, randomUUID } from 'node:crypto';
import type { Collection, Db, Document } from 'mongodb';

import type {
  ManagedAlarmRule,
  ManagedRuleAudit,
  RuleDraftInput,
} from '@/modules/alarm/domain/rule-manager';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export interface ManagedRuleRecord {
  readonly id: string;
  readonly revision: number;
  readonly draft: ManagedAlarmRule;
  readonly published: ManagedAlarmRule | null;
  readonly audit: readonly ManagedRuleAudit[];
}

export interface RuleManagerStore {
  list(): Promise<readonly ManagedRuleRecord[]>;
  get(id: string): Promise<ManagedRuleRecord | null>;
  saveDraft(input: RuleDraftInput, actorId: string): Promise<ManagedRuleRecord>;
  changeStatus(
    id: string,
    revision: number,
    action: 'PUBLISH' | 'DISABLE',
    actorId: string,
  ): Promise<ManagedRuleRecord>;
}

function ruleId(input: RuleDraftInput): string {
  return (
    'alarm-rule:' +
    createHash('sha256')
      .update([input.scope, input.scopeId ?? '', input.code].join('|'))
      .digest('hex')
      .slice(0, 32)
  );
}

function audit(
  rule: ManagedAlarmRule,
  actorId: string,
  action: ManagedRuleAudit['action'],
): ManagedRuleAudit {
  return {
    id: randomUUID(),
    ruleId: rule.id,
    revision: rule.revision,
    action,
    actorId,
    occurredAt: rule.updatedAt,
    snapshot: rule,
  };
}

export class MemoryRuleManagerStore implements RuleManagerStore {
  private readonly records = new Map<string, ManagedRuleRecord>();

  async list(): Promise<readonly ManagedRuleRecord[]> {
    return [...this.records.values()].sort((a, b) =>
      b.draft.updatedAt.localeCompare(a.draft.updatedAt),
    );
  }
  async get(id: string): Promise<ManagedRuleRecord | null> {
    return this.records.get(id) ?? null;
  }
  async saveDraft(input: RuleDraftInput, actorId: string): Promise<ManagedRuleRecord> {
    const id = ruleId(input);
    if (input.id && input.id !== id) throw new Error('RULE_ID_SCOPE_MISMATCH');
    const previous = this.records.get(id);
    if (previous && input.expectedRevision !== previous.revision)
      throw new Error('RULE_STALE_WRITE');
    if (!previous && input.expectedRevision) throw new Error('RULE_STALE_WRITE');
    const now = new Date().toISOString(),
      revision = (previous?.revision ?? 0) + 1;
    const draft: ManagedAlarmRule = {
      ...input,
      id,
      revision,
      status: 'DRAFT',
      updatedBy: actorId,
      createdAt: previous?.draft.createdAt ?? now,
      updatedAt: now,
    };
    const record: ManagedRuleRecord = {
      id,
      revision,
      draft,
      published: previous?.published ?? null,
      audit: [
        ...(previous?.audit ?? []),
        audit(draft, actorId, previous ? 'DRAFT_UPDATED' : 'CREATED'),
      ],
    };
    this.records.set(id, record);
    return record;
  }
  async changeStatus(
    id: string,
    revision: number,
    action: 'PUBLISH' | 'DISABLE',
    actorId: string,
  ): Promise<ManagedRuleRecord> {
    const previous = this.records.get(id);
    if (!previous) throw new Error('RULE_NOT_FOUND');
    if (previous.revision !== revision) throw new Error('RULE_STALE_WRITE');
    const updated: ManagedAlarmRule = {
      ...previous.draft,
      revision: revision + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
      status: action === 'PUBLISH' ? 'PUBLISHED' : 'DISABLED',
    };
    const record: ManagedRuleRecord = {
      ...previous,
      revision: updated.revision,
      draft: updated,
      published: action === 'PUBLISH' ? updated : null,
      audit: [
        ...previous.audit,
        audit(updated, actorId, action === 'PUBLISH' ? 'PUBLISHED' : 'DISABLED'),
      ],
    };
    this.records.set(id, record);
    return record;
  }
}

type MongoRuleRecord = ManagedRuleRecord & Document;

/** Revisions and the audit trail change atomically in the same document. */
export class MongoRuleManagerStore implements RuleManagerStore {
  private readonly collection: Collection<MongoRuleRecord>;
  constructor(db: Db) {
    this.collection = db.collection<MongoRuleRecord>('alarm_rule_configurations');
  }
  private clean(row: MongoRuleRecord): ManagedRuleRecord {
    const copy = { ...row } as Record<string, unknown>;
    delete copy._id;
    return copy as unknown as ManagedRuleRecord;
  }
  async list(): Promise<readonly ManagedRuleRecord[]> {
    return (
      await this.collection.find({}).sort({ 'draft.updatedAt': -1 }).limit(2000).toArray()
    ).map((row) => this.clean(row));
  }
  async get(id: string): Promise<ManagedRuleRecord | null> {
    const row = await this.collection.findOne({ id });
    return row ? this.clean(row) : null;
  }
  async saveDraft(input: RuleDraftInput, actorId: string): Promise<ManagedRuleRecord> {
    const id = ruleId(input);
    if (input.id && input.id !== id) throw new Error('RULE_ID_SCOPE_MISMATCH');
    const previous = await this.get(id);
    if (previous && input.expectedRevision !== previous.revision)
      throw new Error('RULE_STALE_WRITE');
    if (!previous && input.expectedRevision) throw new Error('RULE_STALE_WRITE');
    const now = new Date().toISOString(),
      revision = (previous?.revision ?? 0) + 1;
    const draft: ManagedAlarmRule = {
      ...input,
      id,
      revision,
      status: 'DRAFT',
      updatedBy: actorId,
      createdAt: previous?.draft.createdAt ?? now,
      updatedAt: now,
    };
    const record: ManagedRuleRecord = {
      id,
      revision,
      draft,
      published: previous?.published ?? null,
      audit: [
        ...(previous?.audit ?? []),
        audit(draft, actorId, previous ? 'DRAFT_UPDATED' : 'CREATED'),
      ],
    };
    if (!previous) {
      try {
        await this.collection.insertOne(record as MongoRuleRecord);
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
          throw new Error('RULE_STALE_WRITE');
        throw error;
      }
    } else {
      const result = await this.collection.replaceOne({ id, revision: previous.revision }, record);
      if (result.matchedCount !== 1) throw new Error('RULE_STALE_WRITE');
    }
    return record;
  }
  async changeStatus(
    id: string,
    revision: number,
    action: 'PUBLISH' | 'DISABLE',
    actorId: string,
  ): Promise<ManagedRuleRecord> {
    const previous = await this.get(id);
    if (!previous) throw new Error('RULE_NOT_FOUND');
    if (revision !== previous.revision) throw new Error('RULE_STALE_WRITE');
    const updated: ManagedAlarmRule = {
      ...previous.draft,
      revision: revision + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
      status: action === 'PUBLISH' ? 'PUBLISHED' : 'DISABLED',
    };
    const record: ManagedRuleRecord = {
      ...previous,
      revision: updated.revision,
      draft: updated,
      published: action === 'PUBLISH' ? updated : null,
      audit: [
        ...previous.audit,
        audit(updated, actorId, action === 'PUBLISH' ? 'PUBLISHED' : 'DISABLED'),
      ],
    };
    const result = await this.collection.replaceOne({ id, revision }, record);
    if (result.matchedCount !== 1) throw new Error('RULE_STALE_WRITE');
    return record;
  }
}

export async function createRuleManagerStore(): Promise<RuleManagerStore> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<RuleManagerStore>(
      'alarm-rule-manager-memory',
      () => new MemoryRuleManagerStore(),
    );
  }
  return new MongoRuleManagerStore(await getMongoDatabase());
}
