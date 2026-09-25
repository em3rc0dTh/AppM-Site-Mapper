import type { AuditRepository } from '@/modules/audit/application/audit-repository';
import { AuditService } from '@/modules/audit/application/audit-service';
import { MemoryAuditRepository } from '@/modules/audit/infrastructure/memory-audit-repository';
import { MongoAuditRepository } from '@/modules/audit/infrastructure/mongo-audit-repository';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export interface AuditRuntime {
  readonly repository: AuditRepository;
  readonly service: AuditService;
}

let mongoRuntime: Promise<AuditRuntime> | undefined;

function getMemoryRuntime(): AuditRuntime {
  return getProcessSingleton<AuditRuntime>('audit-memory-runtime', () => {
    const repository = new MemoryAuditRepository();
    return {
      repository,
      service: new AuditService(repository),
    };
  });
}

export async function getAuditRuntime(): Promise<AuditRuntime> {
  if (getPersistenceMode() === 'memory') {
    return getMemoryRuntime();
  }

  mongoRuntime ??= getMongoDatabase().then((database) => {
    const repository = new MongoAuditRepository(database);
    return {
      repository,
      service: new AuditService(repository),
    };
  });

  return mongoRuntime;
}
