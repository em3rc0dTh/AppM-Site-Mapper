import { MongoClient, type Db } from 'mongodb';

import { requireRuntimeSecret } from '@/config/env';
import { ensurePersistenceIndexes } from '@/shared/infrastructure/mongodb/bootstrap';

let clientPromise: Promise<MongoClient> | undefined;
let databasePromise: Promise<Db> | undefined;

export function getClient(): Promise<MongoClient> {
  const uri = requireRuntimeSecret('MONGODB_URI', process.env.MONGODB_URI);

  clientPromise ??= new MongoClient(uri, {
    maxPoolSize: 20,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5_000,
  }).connect();

  return clientPromise;
}

export function getMongoDatabase(): Promise<Db> {
  databasePromise ??= getClient().then(async (client) => {
    const databaseName = process.env.MONGODB_DB_NAME?.trim() || 'appm_site_mapper';
    const database = client.db(databaseName);
    await ensurePersistenceIndexes(database);
    return database;
  });

  return databasePromise;
}
