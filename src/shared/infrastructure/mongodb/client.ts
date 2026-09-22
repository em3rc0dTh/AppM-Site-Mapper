import { MongoClient, type Db } from 'mongodb';

import { requireRuntimeSecret } from '@/config/env';

let clientPromise: Promise<MongoClient> | undefined;

function getClient(): Promise<MongoClient> {
  const uri = requireRuntimeSecret('MONGODB_URI', process.env.MONGODB_URI);

  clientPromise ??= new MongoClient(uri, {
    maxPoolSize: 20,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5_000,
  }).connect();

  return clientPromise;
}

export async function getMongoDatabase(): Promise<Db> {
  const client = await getClient();
  const databaseName = process.env.MONGODB_DB_NAME?.trim() || 'appm_site_mapper';

  return client.db(databaseName);
}
