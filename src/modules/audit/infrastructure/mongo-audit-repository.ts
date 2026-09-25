import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { AuditRepository } from '@/modules/audit/application/audit-repository';
import type { AuditEvent } from '@/modules/audit/domain/entities';

interface AuditDocument extends Document {
  id: string;
  occurredAt: Date;
  actor: AuditEvent['actor'];
  action: AuditEvent['action'];
  target?: AuditEvent['target'];
  outcome: AuditEvent['outcome'];
  metadata: AuditEvent['metadata'];
}

function toDomain(document: AuditDocument): AuditEvent {
  return {
    id: document.id,
    occurredAt: document.occurredAt.toISOString(),
    actor: structuredClone(document.actor),
    action: document.action,
    ...(document.target === undefined ? {} : { target: structuredClone(document.target) }),
    outcome: document.outcome,
    metadata: structuredClone(document.metadata),
  };
}

function toDocument(event: AuditEvent): AuditDocument {
  return {
    id: event.id,
    occurredAt: new Date(event.occurredAt),
    actor: structuredClone(event.actor),
    action: event.action,
    ...(event.target === undefined ? {} : { target: structuredClone(event.target) }),
    outcome: event.outcome,
    metadata: structuredClone(event.metadata),
  };
}

function boundedLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 1000);
}

export class MongoAuditRepository implements AuditRepository {
  private readonly events: Collection<AuditDocument>;

  constructor(database: Db) {
    this.events = database.collection<AuditDocument>('audit_events');
  }

  async append(event: AuditEvent): Promise<void> {
    await this.events.insertOne(toDocument(event) as OptionalUnlessRequiredId<AuditDocument>);
  }

  async listRecent(limit: number): Promise<readonly AuditEvent[]> {
    const documents = await this.events
      .find({})
      .sort({ occurredAt: -1 })
      .limit(boundedLimit(limit))
      .toArray();

    return documents.map(toDomain);
  }
}
