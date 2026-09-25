import type { AuditEvent } from '@/modules/audit/domain/entities';

export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
  listRecent(limit: number): Promise<readonly AuditEvent[]>;
}
