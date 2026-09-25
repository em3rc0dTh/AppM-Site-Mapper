import type { AuditRepository } from '@/modules/audit/application/audit-repository';
import type { AuditEvent } from '@/modules/audit/domain/entities';

function boundedLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 1000);
}

export class MemoryAuditRepository implements AuditRepository {
  private readonly events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    if (this.events.some((candidate) => candidate.id === event.id)) {
      throw new Error('Audit event id must be unique.');
    }

    this.events.push(structuredClone(event));
  }

  async listRecent(limit: number): Promise<readonly AuditEvent[]> {
    return [...this.events]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, boundedLimit(limit))
      .map((event) => structuredClone(event));
  }
}
