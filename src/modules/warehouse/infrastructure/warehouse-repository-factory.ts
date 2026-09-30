import type { WarehouseRepository } from '@/modules/warehouse/application/warehouse-repository';
import { MemoryWarehouseRepository } from '@/modules/warehouse/infrastructure/memory-warehouse-repository';
import { MongoWarehouseRepository } from '@/modules/warehouse/infrastructure/mongo-warehouse-repository';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

let mongoRepository: Promise<WarehouseRepository> | undefined;

export async function createWarehouseRepository(): Promise<WarehouseRepository> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<WarehouseRepository>(
      'warehouse-memory-repository',
      () => new MemoryWarehouseRepository(),
    );
  }

  mongoRepository ??= getMongoDatabase().then(
    (database) => new MongoWarehouseRepository(database),
  );
  return mongoRepository;
}
